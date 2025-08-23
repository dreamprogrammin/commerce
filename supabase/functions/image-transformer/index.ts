// supabase/functions/image-transformer/index.ts

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import sharp from 'https://esm.sh/sharp@0.33.4'
import { corsHeaders } from '../_shared/cors.ts'

console.log('Universal image transformer function initialized!')

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_ANON_KEY') ?? '',
)

serve(async (req: Request) => {
  try {
    const url = new URL(req.url)
    
    // [НОВОЕ]: Получаем название бакета из параметров URL
    const bucket = url.searchParams.get('bucket')
    const imagePath = url.searchParams.get('url')
    const width = parseInt(url.searchParams.get('width') || '0', 10)
    const height = parseInt(url.searchParams.get('height') || '0', 10)
    const quality = parseInt(url.searchParams.get('quality') || '75', 10)

    // [НОВОЕ]: Добавляем проверку, что бакет был передан
    if (!bucket) {
      return new Response('Bucket parameter is missing', { status: 400, headers: corsHeaders })
    }
    if (!imagePath) {
      return new Response('Image URL parameter is missing', { status: 400, headers: corsHeaders })
    }
    
    // [ИЗМЕНЕНИЕ]: Используем переменную 'bucket' вместо жестко заданного названия
    const { data: imageBuffer, error } = await supabaseAdmin.storage
      .from(bucket) 
      .download(imagePath)

    if (error || !imageBuffer) {
      console.error(`Error downloading image from bucket "${bucket}":`, error)
      return new Response(`Image not found at path: ${imagePath} in bucket: ${bucket}`, { status: 404, headers: corsHeaders })
    }
    
    // Остальная часть кода без изменений
    const originalImageArrayBuffer = await imageBuffer.arrayBuffer()
    const transformedImage = await sharp(originalImageArrayBuffer)
      .resize({ width: width || undefined, height: height || undefined, fit: 'cover' })
      .toFormat('webp', { quality })
      .toBuffer()

    return new Response(transformedImage, {
      headers: { ...corsHeaders, 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=31536000, immutable' },
    })

  } catch (err) {
    console.error('Error processing image:', err)
    let errorMessage = 'An unknown error occurred.'
    if (err instanceof Error) {
      errorMessage = err.message
    }
    return new Response(`Error processing image: ${errorMessage}`, { status: 500, headers: corsHeaders })
  }
})