import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-signature-ed25519, x-signature-timestamp',
}

// Function to verify Discord signature
async function verifySignature(request: Request, body: string): Promise<boolean> {
  const PUBLIC_KEY = Deno.env.get('DISCORD_PUBLIC_KEY')
  if (!PUBLIC_KEY) {
    console.error('Missing DISCORD_PUBLIC_KEY')
    return false
  }

  const signature = request.headers.get('x-signature-ed25519')
  const timestamp = request.headers.get('x-signature-timestamp')
  
  if (!signature || !timestamp) {
    console.error('Missing signature headers')
    return false
  }

  try {
    const encoder = new TextEncoder()
    const message = encoder.encode(timestamp + body)
    const sigBytes = new Uint8Array(Buffer.from(signature, 'hex'))
    const keyBytes = new Uint8Array(Buffer.from(PUBLIC_KEY, 'hex'))
    
    // Import the public key
    const key = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      {
        name: 'Ed25519',
        namedCurve: 'Ed25519',
      },
      false,
      ['verify']
    )
    
    // Verify the signature
    const isValid = await crypto.subtle.verify(
      'Ed25519',
      key,
      sigBytes,
      message
    )
    
    return isValid
  } catch (error) {
    console.error('Signature verification error:', error)
    return false
  }
}

serve(async (req) => {
  console.log('Request received:', req.method, req.url)
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const DISCORD_BOT_TOKEN = Deno.env.get('DISCORD_BOT_TOKEN')
    const DISCORD_APPLICATION_ID = Deno.env.get('DISCORD_APPLICATION_ID')
    const DISCORD_PUBLIC_KEY = Deno.env.get('DISCORD_PUBLIC_KEY')
    
    console.log('Environment check:', {
      hasToken: !!DISCORD_BOT_TOKEN,
      hasAppId: !!DISCORD_APPLICATION_ID,
      hasPublicKey: !!DISCORD_PUBLIC_KEY
    })
    
    if (!DISCORD_BOT_TOKEN || !DISCORD_APPLICATION_ID || !DISCORD_PUBLIC_KEY) {
      console.error('Missing Discord credentials')
      return new Response(JSON.stringify({
        error: 'Missing Discord credentials',
        hasToken: !!DISCORD_BOT_TOKEN,
        hasAppId: !!DISCORD_APPLICATION_ID,
        hasPublicKey: !!DISCORD_PUBLIC_KEY
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const url = new URL(req.url)
    
    // Route for registering slash commands
    if (url.pathname === '/register-commands' || (req.method === 'GET' && url.pathname !== '/')) {
      console.log('Registering command...')
      
      const command = {
        name: 'ping',
        description: 'Simple ping command to test the bot'
      }

      const response = await fetch(
        `https://discord.com/api/v10/applications/${DISCORD_APPLICATION_ID}/commands`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bot ${DISCORD_BOT_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(command),
        }
      )

      if (!response.ok) {
        const errorData = await response.text()
        console.error('Failed to register command:', response.status, errorData)
        return new Response(JSON.stringify({
          error: `Failed to register command: ${response.status}`,
          details: errorData
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const result = await response.json()
      console.log('Command registered successfully:', result)

      return new Response(JSON.stringify({
        success: true,
        message: 'Simple ping command registered successfully!',
        command: result
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Handle Discord interactions - verify signature first
    const bodyText = await req.text()
    
    // Verify the request signature
    const isValidSignature = await verifySignature(req, bodyText)
    if (!isValidSignature) {
      console.error('Invalid signature')
      return new Response('Unauthorized', { status: 401 })
    }

    const body = JSON.parse(bodyText)
    console.log('Discord interaction received:', body)
    
    // Handle Discord interaction verification
    if (body.type === 1) {
      console.log('Ping verification')
      return new Response(JSON.stringify({ type: 1 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Handle slash commands
    if (body.type === 2) {
      const { data: command } = body
      console.log('Slash command received:', command.name)
      
      if (command.name === 'ping') {
        return new Response(JSON.stringify({
          type: 4,
          data: {
            content: '🏓 Pong! The bot is working!'
          }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // Default response for unknown commands
    return new Response(JSON.stringify({
      type: 4,
      data: {
        content: '❌ Unknown command!',
        flags: 64
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Discord bot error:', error)
    return new Response(JSON.stringify({
      error: 'Bot error occurred',
      details: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
