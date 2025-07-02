import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  console.log('Request received:', req.method, req.url)
  
  if (req.method === 'OPTIONS') {
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
    
    // Route for registering slash commands
    if (url.pathname === '/register-commands' || req.method === 'GET') {
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

    // Handle Discord interactions
    const body = await req.json()
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

    // Default response
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
