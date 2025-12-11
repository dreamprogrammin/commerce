import { corsHeaders } from './cors.ts'

export function successResponse(message: string, data?: Record<string, unknown>) {
  return new Response(
    JSON.stringify({ success: true, message, ...data }),
    {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    }
  )
}

export function errorResponse(message: string, status = 400) {
  return new Response(
    JSON.stringify({ success: false, error: message }),
    {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status,
    }
  )
}

export function textResponse(text: string, status = 200) {
  return new Response(text, {
    headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' },
    status,
  })
}