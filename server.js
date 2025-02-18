const express = require('express');
const fetch = require('node-fetch');
const app = express();

// Middleware to parse JSON bodies
app.use(express.json());

// Add detailed logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  console.log('Headers:', req.headers);
  console.log('Body:', req.body);
  
  next();
});

// Medical system prompt
const SYSTEM_PROMPT = `You are Dr. AI, a helpful and knowledgeable medical assistant. Always:
1. Maintain a professional and empathetic tone
2. Clearly state you are an AI assistant, not a real doctor
3. Recommend consulting with a real healthcare provider for serious concerns
4. Only provide general medical information and avoid specific diagnoses
5. Keep responses clear and easy to understand`;

// Helper function to send message to Telegram
async function sendTelegramMessage(chatId, text) {
  console.log('Attempting to send telegram message:', { chatId, textLength: text.length });
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  const url = `https://api.telegram.org/bot${telegramToken}/sendMessage`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML',
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Telegram API error: ${response.status} ${errorText}`);
    }
    
    const data = await response.json();
    console.log('Telegram API response:', data);
    return data;
  } catch (error) {
    console.error('Error sending telegram message:', error);
    throw error;
  }
}

// Helper function to get AI response
async function getAIResponse(prompt) {
  console.log('Requesting AI response for prompt:', prompt);
  try {
    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`
      },
      body: JSON.stringify({
        model: 'mistral-tiny',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 500
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Mistral API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    console.log('Mistral API response:', data);
    
    if (!data.choices || !data.choices[0]) {
      throw new Error('Invalid response from Mistral API: ' + JSON.stringify(data));
    }
    
    return data.choices[0].message.content;
  } catch (error) {
    console.error('Error getting AI response:', error);
    throw error;
  }
}

// Main webhook endpoint
app.post('/webhook', async (req, res) => {
  console.log('Webhook received at:', new Date().toISOString());
  try {
    const update = req.body;
    console.log('Update body:', JSON.stringify(update, null, 2));
    
    if (!update) {
      console.log('No update body received');
      return res.status(400).send('No update body');
    }
    
    if (!update.message || !update.message.text) {
      console.log('No message or text in update:', JSON.stringify(update, null, 2));
      return res.send('OK');
    }

    const chatId = update.message.chat.id;
    const userMessage = update.message.text;
    console.log('Processing message:', { chatId, userMessage });

    // Send immediate response to Telegram
    res.send('OK');

    // Process message asynchronously
    try {
      const aiResponse = await getAIResponse(userMessage);
      console.log('AI response received:', aiResponse);

      await sendTelegramMessage(chatId, aiResponse);
      console.log('Response sent successfully to chat:', chatId);
    } catch (error) {
      console.error('Error processing message:', error);
      // Send error message to user
      await sendTelegramMessage(chatId, 'Sorry, I encountered an error processing your message. Please try again later.');
    }
  } catch (error) {
    console.error('Error in webhook handler:', error);
    // Only send error response if we haven't sent one already
    if (!res.headersSent) {
      res.status(500).send('Error: ' + error.message);
    }
  }
});

// Setup webhook endpoint
app.get('/setup-webhook', async (req, res) => {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const glitchUrl = `https://${process.env.PROJECT_DOMAIN}.glitch.me`;
    const webhookUrl = `${glitchUrl}/webhook`;
    
    console.log('Setting webhook to:', webhookUrl);

    // First, delete any existing webhook
    const deleteResponse = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`);
    const deleteResult = await deleteResponse.json();
    console.log('Delete webhook result:', deleteResult);

    // Set the new webhook
    const setResponse = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: webhookUrl,
        allowed_updates: ['message']
      }),
    });

    const setResult = await setResponse.json();
    console.log('Set webhook result:', setResult);

    res.json({
      success: true,
      webhook_url: webhookUrl,
      deleteResult,
      setResult
    });
  } catch (error) {
    console.error('Error setting webhook:', error);
    res.json({
      success: false,
      error: error.message
    });
  }
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'running',
    timestamp: new Date().toISOString(),
    env: {
      hasTelegramToken: !!process.env.TELEGRAM_BOT_TOKEN,
      hasMistralKey: !!process.env.MISTRAL_API_KEY,
      projectDomain: process.env.PROJECT_DOMAIN
    }
  });
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server started at ${new Date().toISOString()}`);
  console.log(`Running on port ${PORT}`);
  console.log('Environment check:');
  console.log('- PROJECT_DOMAIN:', process.env.PROJECT_DOMAIN);
  console.log('- Bot token exists:', !!process.env.TELEGRAM_BOT_TOKEN);
  console.log('- Mistral API key exists:', !!process.env.MISTRAL_API_KEY);
});