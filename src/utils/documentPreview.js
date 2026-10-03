function getPathCandidates(storagePath, bucket) {
    if (!storagePath) return [];

    let normalized = String(storagePath).trim();

    try {
        if (/^https?:\/\//i.test(normalized)) {
            const url = new URL(normalized);
            const objectMarker = `/object/${bucket}/`;
            const publicMarker = `/object/public/${bucket}/`;
            const signedMarker = `/object/sign/${bucket}/`;
            const marker = [publicMarker, signedMarker, objectMarker].find((item) => url.pathname.includes(item));

            if (marker) {
                normalized = url.pathname.split(marker)[1] || normalized;
            }
        }

        normalized = decodeURIComponent(normalized);
    } catch {
        // Keep the stored value as a fallback when it is not a valid encoded URL.
    }

    normalized = normalized.replace(/^\/+/, '');
    const bucketPrefix = `${bucket}/`;
    const withoutBucket = normalized.startsWith(bucketPrefix)
        ? normalized.slice(bucketPrefix.length)
        : normalized;

    return [...new Set([withoutBucket, normalized].filter(Boolean))];
}

export async function createDocumentSignedUrl(supabase, document, expiresIn = 60 * 60) {
    const buckets = [...new Set([document.storage_bucket, 'documents'].filter(Boolean))];
    let lastError = null;

    if (!document.storage_path) {
        throw new Error('This document does not have a stored file path.');
    }

    for (const bucket of buckets) {
        const candidates = getPathCandidates(document.storage_path, bucket);

        for (const path of candidates) {
            const { data, error } = await supabase.storage
                .from(bucket)
                .createSignedUrl(path, expiresIn);

            if (!error && data?.signedUrl) {
                return data.signedUrl;
            }

            lastError = error;
        }
    }

    const error = new Error('The file could not be accessed. Apply the manager storage policy, then confirm the object still exists in the documents bucket.');
    error.cause = lastError;
    throw error;
}
