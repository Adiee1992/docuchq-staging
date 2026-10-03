import { supabase } from '../supabaseClient';

export async function getProfile(userId) {
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

    if (error) {
        throw error;
    }

    return data;
}

export async function getProfileByEmail(email) {
    if (!email) return null;

    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('email', email)
        .maybeSingle();

    if (error) {
        throw error;
    }

    return data;
}

export async function ensureProfile(user) {
    if (!user) return null;

    const existingProfile = await getProfile(user.id);
    if (existingProfile) {
        if (existingProfile.deletion_scheduled_for) {
            const { error: restoreError } = await supabase.rpc('restore_own_pending_account');
            if (restoreError) throw restoreError;
            existingProfile.deletion_requested_at = null;
            existingProfile.deletion_scheduled_for = null;
        }
        if (user.email && existingProfile.email !== user.email) {
            const { data, error } = await supabase
                .from('profiles')
                .update({
                    email: user.email,
                    updated_at: new Date().toISOString()
                })
                .eq('id', user.id)
                .select()
                .single();

            if (error) {
                throw error;
            }

            return data;
        }

        return existingProfile;
    }

    try {
        const emailProfile = await getProfileByEmail(user.email);
        if (emailProfile) {
            if (emailProfile.id === user.id) {
                return emailProfile;
            }

            throw new Error(`A profile exists for ${user.email}, but its id does not match the authenticated user id. Update public.profiles.id to ${user.id}.`);
        }
    } catch (error) {
        if (error.message?.includes('does not match')) {
            throw error;
        }
    }

    const metadata = user.user_metadata || {};
    const profilePayload = {
        id: user.id,
        email: user.email,
        first_name: metadata.first_name || '',
        last_name: metadata.last_name || '',
        company_name: metadata.company_name || '',
        iec_code: metadata.iec_code || '',
        mobile_number: metadata.mobile_number || '',
        address: metadata.address || '',
        gstin: metadata.gstin || '',
        pan: metadata.pan || '',
        role: metadata.role || 'exporter'
    };

    const { data, error } = await supabase
        .from('profiles')
        .upsert(profilePayload, { onConflict: 'id' })
        .select()
        .single();

    if (error) {
        throw error;
    }

    return data;
}
