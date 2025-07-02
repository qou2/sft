import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const DISCORD_BOT_TOKEN = Deno.env.get('DISCORD_BOT_TOKEN')
    const DISCORD_APPLICATION_ID = Deno.env.get('DISCORD_APPLICATION_ID')
    
    if (!DISCORD_BOT_TOKEN || !DISCORD_APPLICATION_ID) {
      throw new Error('Missing Discord bot credentials')
    }

    const url = new URL(req.url)
    
    // Route for registering slash commands
    if (url.pathname === '/register-commands' || req.method === 'GET') {
      // Define the slash command
      const command = {
        name: 'addrank',
        description: 'Add or update a player\'s Snowfall ranking',
        options: [
          {
            name: 'minecraft_username',
            description: 'The Minecraft username of the player',
            type: 3, // STRING
            required: true
          },
          {
            name: 'playstyle',
            description: 'Playstyle score (1-100)',
            type: 4, // INTEGER
            required: true,
            min_value: 1,
            max_value: 100
          },
          {
            name: 'movement',
            description: 'Movement score (1-100)',
            type: 4, // INTEGER
            required: true,
            min_value: 1,
            max_value: 100
          },
          {
            name: 'pvp',
            description: 'PvP score (1-100)',
            type: 4, // INTEGER
            required: true,
            min_value: 1,
            max_value: 100
          },
          {
            name: 'building',
            description: 'Building score (1-100)',
            type: 4, // INTEGER
            required: true,
            min_value: 1,
            max_value: 100
          },
          {
            name: 'projectiles',
            description: 'Projectiles score (1-100)',
            type: 4, // INTEGER
            required: true,
            min_value: 1,
            max_value: 100
          }
        ]
      }

      // Register the command globally
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
        throw new Error(`Failed to register command: ${response.status} ${errorData}`)
      }

      const result = await response.json()
      console.log('Command registered successfully:', result)

      return new Response(JSON.stringify({
        success: true,
        message: 'Discord slash command registered successfully!',
        command: result
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Handle Discord interactions (main bot functionality)
    const body = await req.json()
    
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)
    
    // Handle Discord interaction verification
    if (body.type === 1) {
      return new Response(JSON.stringify({ type: 1 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Handle slash commands
    if (body.type === 2) {
      const { data: command } = body
      
      if (command.name === 'addrank') {
        try {
          // Extract options from Discord command
          const options = command.options || []
          const getOption = (name: string) => options.find((opt: any) => opt.name === name)?.value

          const minecraft_username = getOption('minecraft_username')
          const playstyle = parseInt(getOption('playstyle'))
          const movement = parseInt(getOption('movement'))
          const pvp = parseInt(getOption('pvp'))
          const building = parseInt(getOption('building'))
          const projectiles = parseInt(getOption('projectiles'))

          // Validate inputs
          if (!minecraft_username) {
            return new Response(JSON.stringify({
              type: 4,
              data: {
                content: '❌ Minecraft username is required!',
                flags: 64 // Ephemeral
              }
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
          }

          const stats = [playstyle, movement, pvp, building, projectiles]
          if (stats.some(stat => stat === undefined || stat < 1 || stat > 100)) {
            return new Response(JSON.stringify({
              type: 4,
              data: {
                content: '❌ All stats must be numbers between 1 and 100!',
                flags: 64 // Ephemeral
              }
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
          }

          // Calculate overall score (average of the 5 stats)
          const overall_score = (playstyle + movement + pvp + building + projectiles) / 5
          
          // Calculate tier based on score using the correct thresholds
          let tier = 'No Rank'
          if (overall_score >= 97) tier = 'HT1'
          else if (overall_score >= 93) tier = 'MT1'
          else if (overall_score >= 89) tier = 'LT1'
          else if (overall_score >= 84) tier = 'HT2'
          else if (overall_score >= 80) tier = 'MT2'
          else if (overall_score >= 76) tier = 'LT2'
          else if (overall_score >= 71) tier = 'HT3'
          else if (overall_score >= 67) tier = 'MT3'
          else if (overall_score >= 63) tier = 'LT3'
          else if (overall_score >= 58) tier = 'HT4'
          else if (overall_score >= 54) tier = 'MT4'
          else if (overall_score >= 50) tier = 'LT4'

          // Insert/update player in database
          const { data: player, error } = await supabase
            .from('snowfall_players')
            .upsert({
              minecraft_username,
              playstyle,
              movement,
              pvp,
              building,
              projectiles,
              overall_score,
              tier,
              updated_at: new Date().toISOString()
            })
            .select()
            .single()

          if (error) {
            console.error('Database error:', error)
            return new Response(JSON.stringify({
              type: 4,
              data: {
                content: '❌ Failed to add/update player ranking in database!',
                flags: 64 // Ephemeral
              }
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
          }

          // Create success response with detailed breakdown
          const tierEmoji = tier.includes('HT1') ? '🥇' : 
                           tier.includes('MT1') || tier.includes('LT1') ? '🥈' :
                           tier.includes('HT2') || tier.includes('MT2') || tier.includes('LT2') ? '🥉' :
                           tier.includes('HT3') || tier.includes('MT3') || tier.includes('LT3') ? '🏆' :
                           tier.includes('HT4') || tier.includes('MT4') || tier.includes('LT4') ? '🏅' : '⚪'

          const responseMessage = `✅ **Successfully added/updated ${minecraft_username}!**

${tierEmoji} **Tier:** ${tier}
📊 **Overall Score:** ${overall_score.toFixed(1)}/100

**Detailed Stats:**
🎮 **Playstyle:** ${playstyle}/100
🏃 **Movement:** ${movement}/100
⚔️ **PvP:** ${pvp}/100
🏗️ **Building:** ${building}/100
🏹 **Projectiles:** ${projectiles}/100

View the updated rankings at: https://mcbetiers.com/snowfall`

          return new Response(JSON.stringify({
            type: 4,
            data: {
              content: responseMessage
            }
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })

        } catch (error) {
          console.error('Error processing addrank command:', error)
          return new Response(JSON.stringify({
            type: 4,
            data: {
              content: '❌ An error occurred while processing the command!',
              flags: 64 // Ephemeral
            }
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
      }
    }

    // Default response for unknown interactions
    return new Response(JSON.stringify({
      type: 4,
      data: {
        content: '❌ Unknown command!',
        flags: 64 // Ephemeral
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Discord bot error:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})