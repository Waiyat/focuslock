import { supabase } from './supabase';
import { getBackendBaseUrl } from './api';

export const AVATARS_BUCKET = 'avatars';

/**
 * Uploads a user avatar to Supabase Storage and updates the user's profile.
 * 
 * @param userId - Supabase auth user UUID
 * @param fileBody - ArrayBuffer or Blob or base64 file data
 * @param fileExt - File extension (e.g. 'jpg', 'png', 'webp')
 * @param mimeType - Image mime type (e.g. 'image/jpeg')
 * @returns Public URL of the uploaded avatar
 */
export async function uploadAvatar(
  userId: string,
  fileBody: ArrayBuffer | Blob | Uint8Array,
  fileExt: string = 'jpg',
  mimeType: string = 'image/jpeg'
): Promise<{ url: string | null; error: Error | null }> {
  try {
    const filePath = `${userId}/avatar_${Date.now()}.${fileExt}`;
    const safeMime = mimeType || (fileExt === 'png' ? 'image/png' : fileExt === 'webp' ? 'image/webp' : 'image/jpeg');

    // Ensure the payload has an explicit image MIME type to avoid browser FormData defaulting to text/plain
    let uploadPayload: any = fileBody;
    if (typeof Blob !== 'undefined' && fileBody instanceof Blob) {
      uploadPayload = new Blob([fileBody], { type: safeMime });
    }

    // Upload to avatars bucket
    const { error: uploadError } = await supabase.storage
      .from(AVATARS_BUCKET)
      .upload(filePath, uploadPayload, {
        contentType: safeMime,
        upsert: true,
      });

    if (uploadError) {
      console.warn('Direct storage upload failed with error, falling back to backend:', uploadError.message);

      // Fallback: Upload via backend service role (bypasses RLS)
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;
        if (token) {
          let base64String = '';
          if (typeof FileReader !== 'undefined' && uploadPayload instanceof Blob) {
            base64String = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve((reader.result as string) || '');
              reader.onerror = reject;
              reader.readAsDataURL(uploadPayload);
            });
          } else {
            const buf = uploadPayload instanceof ArrayBuffer ? uploadPayload : await new Response(uploadPayload).arrayBuffer();
            const bytes = new Uint8Array(buf);
            let binary = '';
            const chunkSize = 8192;
            for (let i = 0; i < bytes.length; i += chunkSize) {
              binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
            }
            base64String = `data:${safeMime};base64,${btoa(binary)}`;
          }

          if (base64String) {
            const res = await fetch(`${getBackendBaseUrl()}/api/users/avatar`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                imageBase64: base64String,
                fileExt,
                mimeType: safeMime,
              }),
            });

            const json = await res.json();
            if (res.ok && json.avatarUrl) {
              return { url: json.avatarUrl, error: null };
            }
          }
        }
      } catch (backendErr: any) {
        console.warn('Backend fallback failed:', backendErr);
      }

      return { url: null, error: uploadError };
    }

    // Get public URL
    const { data: publicData } = supabase.storage
      .from(AVATARS_BUCKET)
      .getPublicUrl(filePath);

    const publicUrl = publicData.publicUrl;

    // Update profile table
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ avatar_url: publicUrl })
      .eq('id', userId);

    if (profileError) {
      console.warn('Avatar uploaded but failed to update profile avatar_url:', profileError);
    }

    return { url: publicUrl, error: null };
  } catch (err: any) {
    return { url: null, error: err };
  }
}

/**
 * Returns the public URL for a given avatar file path.
 */
export function getAvatarPublicUrl(filePath: string): string {
  const { data } = supabase.storage.from(AVATARS_BUCKET).getPublicUrl(filePath);
  return data.publicUrl;
}
