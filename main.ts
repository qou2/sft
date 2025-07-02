import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-signature-ed25519, x-signature-timestamp',
}

serve(async (req) => {
  console.log('=== NEW REQUEST ===')
  console.log('Method:', req.method)
  console.log('URL:', req.url)
  console.log('Headers:', Object.fromEntries(req.headers.entries()))
  
  if (req.method === 'OPTIONS') {
    console.log('Handling CORS preflight')
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const DISCORD_BOT_TOKEN = Deno.env.get('DISCORD_BOT_TOKEN')
    const DISCORD_APPLICATION_ID = Deno.env.get('DISCORD_APPLICATION_ID')
    
    console.log('Environment check:', {
      hasToken: !!DISCORD_BOT_TOKEN,
      hasAppId: !!DISCORD_APPLICATION_ID
    })
    
    if (!DISCORD_BOT_TOKEN || !DISCORD_APPLICATION_ID) {
      console.error('Missing Discord credentials')
      return new Response(JSON.stringify({
        error: 'Missing Discord bot credentials',
        hasToken: !!DISCORD_BOT_TOKEN,
        hasAppId: !!DISCORD_APPLICATION_ID
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const url = new URL(req.url)
    
    // Handle browser requests vs Discord interactions
    const userAgent = req.headers.get('user-agent') || ''
    const isDiscordRequest = userAgent.includes('Discord-Interactions') || req.headers.has('x-signature-ed25519')
    const contentType = req.headers.get('content-type') || ''
    
    console.log('Request analysis:', {
      userAgent,
      isDiscordRequest,
      contentType,
      hasSignature: req.headers.has('x-signature-ed25519')
    })

    // Route for registering slash commands (browser/manual requests)
    if (url.pathname === '/register-commands' || (!isDiscordRequest && req.method === 'GET')) {
      console.log('=== BROWSER REQUEST - REGISTERING COMMAND ===')
      
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
        command: result,
        note: 'Now try using /ping in your Discord server!'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Only handle Discord interactions if this looks like a Discord request
    if (!isDiscordRequest) {
      console.log('=== NON-DISCORD REQUEST ===')
      return new Response(JSON.stringify({
        message: 'Discord Bot Endpoint',
        status: 'Running',
        endpoints: {
          '/register-commands': 'Register slash commands',
          '/': 'Discord interactions endpoint'
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Handle Discord interactions (NO SIGNATURE VERIFICATION FOR TESTING)
    console.log('=== HANDLING DISCORD INTERACTION ===')
    const bodyText = await req.text()
    console.log('Raw body length:', bodyText.length)
    console.log('Raw body:', bodyText)
    
    let body
    try {
      body = JSON.parse(bodyText)
      console.log('Parsed interaction:', JSON.stringify(body, null, 2))
    } catch (error) {
      console.error('JSON parse error:', error)
      return new Response(JSON.stringify({
        error: 'Invalid JSON in request body'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    
    // Handle Discord PING verification (type 1)
    if (body.type === 1) {
      console.log('=== DISCORD PING VERIFICATION ===')
      const response = { type: 1 }
      console.log('Sending ping response:', response)
      
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Handle Application Commands (type 2)
    if (body.type === 2) {
      console.log('=== HANDLING SLASH COMMAND ===')
      const { data: command } = body
      console.log('Command name:', command.name)
      console.log('Full command data:', JSON.stringify(command, null, 2))
      
      if (command.name === 'ping') {
        const response = {
          type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
          data: {
            content: '🏓 Pong! Bot is working! ' + new Date().toISOString(),
          }
        }
        
        console.log('Sending ping command response:', JSON.stringify(response, null, 2))
        return new Response(JSON.stringify(response), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      
      // Unknown command
      const response = {
        type: 4,
        data: {
          content: `❌ Unknown command: ${command.name}`,
          flags: 64 // Ephemeral
        }
      }
      
      console.log('Sending unknown command response:', JSON.stringify(response, null, 2))
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Handle other interaction types
    console.log('=== UNHANDLED INTERACTION TYPE ===')
    console.log('Type:', body.type)
    
    const response = {
      type: 4,
      data: {
        content: `Unhandled interaction type: ${body.type}`,
        flags: 64
      }
    }
    
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('=== FATAL ERROR ===')
    console.error('Error:', error)
    console.error('Stack:', error.stack)
    
    return new Response(JSON.stringify({
      error: 'Internal server error',
      message: error.message,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
