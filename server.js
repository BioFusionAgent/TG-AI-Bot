const express = require('express');
const fetch = require('node-fetch');
const app = express();

// Global variables for long polling
let offset = 0;
const POLLING_INTERVAL = 1000; // 1 second

// Function to process messages
async function processMessage(message) {
  try {
    console.log('Processing message:', message);
    
    const chatId = message.chat.id;
    const userText = message.text || 'Non-text message received';

    // First, send acknowledgment
    await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: 'Processing your message...'
      })
    });

    // Get AI response
    const mistralResponse = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`
      },
      body: JSON.stringify({
        model: 'mistral-tiny',
        messages: [
          { 
            role: 'system', 
            content: 'You are a helpful medical AI assistant. Always include a disclaimer that you are an AI.' 
          },
          { role: 'user', content: userText }
        ]
      })
    });

    const mistralData = await mistralResponse.json();
    console.log('Mistral response:', mistralData);

    if (mistralData.choices && mistralData.choices[0]) {
      const aiResponse = mistralData.choices[0].message.content;
      
      // Send AI response back to user
      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: aiResponse
        })
      });
    }
  } catch (error) {
    console.error('Error processing message:', error);
    try {
      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: message.chat.id,
          text: 'Sorry, I encountered an error. Please try again.'
        })
      });
    } catch (sendError) {
      console.error('Error sending error message:', sendError);
    }
  }
}

// Function to get updates from Telegram
async function getUpdates() {
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getUpdates?offset=${offset}&timeout=30`
    );
    const data = await response.json();
    
    if (data.ok && data.result.length > 0) {
      console.log('Received updates:', data.result);
      
      for (const update of data.result) {
        if (update.message) {
          await processMessage(update.message);
        }
        // Update offset to acknowledge the message
        offset = update.update_id + 1;
      }
    }
  } catch (error) {
    console.error('Error getting updates:', error);
  }
  
  // Schedule next update
  setTimeout(getUpdates, POLLING_INTERVAL);
}

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'running',
    timestamp: new Date().toISOString(),
    env: {
      hasTelegramToken: !!process.env.TELEGRAM_BOT_TOKEN,
      hasMistralKey: !!process.env.MISTRAL_API_KEY,
      offset: offset
    }
  });
});

// Start the server and polling
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Server started at ${new Date().toISOString()}`);
  console.log(`Running on port ${PORT}`);
  console.log('Environment check:');
  console.log('- Bot token exists:', !!process.env.TELEGRAM_BOT_TOKEN);
  console.log('- Mistral API key exists:', !!process.env.MISTRAL_API_KEY);
  
  // First, delete any existing webhook
  try {
    const deleteResponse = await fetch(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/deleteWebhook?drop_pending_updates=true`
    );
    const deleteResult = await deleteResponse.json();
    console.log('Deleted webhook:', deleteResult);
    
    // Start long polling
    console.log('Starting long polling...');
    getUpdates();
  } catch (error) {
    console.error('Error starting bot:', error);
  }
});