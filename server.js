const express = require('express');
const app = express();

// Middleware to parse JSON bodies
app.use(express.json());

// Add logging middleware
app.use((req, res, next) => {
  console.log('Incoming request:', {
    path: req.path,
    method: req.method,
    body: req.body
  });
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
  console.log('Sending telegram message to:', chatId);
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  const url = `https://api.telegram.org/bot${telegramToken}/sendMessage`;
  console.log('Telegram API URL:', url);
  
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
  console.log('Getting AI response for prompt:', prompt);
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
  console.log('Received webhook request');
  try {
    const update = req.body;
    console.log('Update body:', update);
    
    // Handle only message updates
    if (!update.message || !update.message.text) {
      console.log('No message or text found in update');
      return res.send('OK');
    }

    const chatId = update.message.chat.id;
    const userMessage = update.message.text;
    console.log('Processing message:', { chatId, userMessage });

    // Get AI response
    const aiResponse = await getAIResponse(userMessage);
    console.log('AI response received:', aiResponse);

    // Send response back to user
    await sendTelegramMessage(chatId, aiResponse);
    console.log('Response sent successfully');

    res.send('OK');
  } catch (error) {
    console.error('Error in webhook handler:', error);
    res.status(500).send('Error: ' + error.message);
  }
});

// Simple health check endpoint
app.get('/', (req, res) => {
  console.log('Health check request received');
  res.send('Bot is running!');
});

// Test endpoint to verify webhook
app.post('/test-webhook', (req, res) => {
  console.log('Test webhook received:', req.body);
  res.send('Test webhook received');
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  
  // Log the environment variables (excluding sensitive data)
  console.log('Environment check:');
  console.log('- Bot token exists:', !!process.env.TELEGRAM_BOT_TOKEN);
  console.log('- Mistral API key exists:', !!process.env.MISTRAL_API_KEY);
});