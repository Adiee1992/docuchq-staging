import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type StorageObject = { bucket: string; path: string };
type RetentionJob = {
  id: string;
  job_type: string;
  storage_objects: StorageObject[] | null;
};

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' }
});

Deno.serve(async (request) => {
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) return jsonResponse({ error: 'Missing Supabase service configuration' }, 500);

  const authorization = request.headers.get('Authorization') || '';
  if (authorization !== `Bearer ${serviceRoleKey}`) return jsonResponse({ error: 'Unauthorized' }, 401);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { error: prepareError } = await supabase.rpc('prepare_retention_cleanup_jobs');
  if (prepareError) return jsonResponse({ error: prepareError.message }, 500);

  const { data, error: claimError } = await supabase.rpc('claim_retention_deletion_jobs', { batch_size: 25 });
  if (claimError) return jsonResponse({ error: claimError.message }, 500);

  const results: Array<{ id: string; status: string; error?: string }> = [];
  for (const job of (data || []) as RetentionJob[]) {
    try {
      const objects = Array.isArray(job.storage_objects) ? job.storage_objects : [];
      const grouped = objects.reduce<Record<string, string[]>>((buckets, object) => {
        if (!object?.bucket || !object?.path) return buckets;
        buckets[object.bucket] = [...(buckets[object.bucket] || []), object.path];
        return buckets;
      }, {});

      let deletedStorageCount = 0;
      for (const [bucket, paths] of Object.entries(grouped)) {
        const uniquePaths = [...new Set(paths)];
        const { error: storageError } = await supabase.storage.from(bucket).remove(uniquePaths);
        if (storageError) throw storageError;
        deletedStorageCount += uniquePaths.length;
      }

      const { error: completeError } = await supabase.rpc('complete_retention_deletion_job', {
        job_id_input: job.id,
        deleted_storage_count: deletedStorageCount
      });
      if (completeError) throw completeError;
      results.push({ id: job.id, status: 'completed' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await supabase.rpc('fail_retention_deletion_job', { job_id_input: job.id, error_input: message });
      results.push({ id: job.id, status: 'failed', error: message });
    }
  }

  return jsonResponse({ processed: results.length, results });
});
