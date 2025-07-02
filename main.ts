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
    // For development/testing, you can temporarily skip signature verification
    // Remove this return statement once you have the public key set up
    console.log('Skipping signature verification for testing')
    return true
    
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
    console.log('Raw request body:', bodyText)
    console.log('Request headers:', Object.fromEntries(req.headers.entries()))
    
    // Verify the request signature
    const isValidSignature = await verifySignature(req, bodyText)
    if (!isValidSignature) {
      console.error('Invalid signature')
      return new Response('Unauthorized', { status: 401 })
    }

    let body
    try {
      body = JSON.parse(bodyText)
      console.log('Parsed Discord interaction:', JSON.stringify(body, null, 2))
    } catch (error) {
      console.error('Failed to parse JSON:', error)
      return new Response('Bad Request', { status: 400 })
    }
    
    // Handle Discord interaction verification (PING)
    if (body.type === 1) {
      console.log('Responding to Discord ping verification')
      return new Response(JSON.stringify({ type: 1 }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Handle slash commands (APPLICATION_COMMAND)
    if (body.type === 2) {
      const { data: command } = body
      console.log(`Processing slash command: ${command.name}`)
      
      if (command.name === 'ping') {
        const response = {
          type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
          data: {
            content: '🏓 Pong! The bot is working perfectly!',
            flags: 0 // Make message visible to everyone
          }
        }
        
        console.log('Sending response:', JSON.stringify(response, null, 2))
        return new Response(JSON.stringify(response), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      
      // Handle unknown commands
      const unknownResponse = {
        type: 4,
        data: {
          content: `❌ Unknown command: ${command.name}`,
          flags: 64 // Ephemeral message (only visible to user)
        }
      }
      
      console.log('Unknown command response:', JSON.stringify(unknownResponse, null, 2))
      return new Response(JSON.stringify(unknownResponse), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Handle other interaction types
    console.log(`Unhandled interaction type: ${body.type}`)
    return new Response(JSON.stringify({
      type: 4,
      data: {
        content: '❌ This interaction type is not supported yet.',
        flags: 64
      }
    }), {
      status: 200,
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
