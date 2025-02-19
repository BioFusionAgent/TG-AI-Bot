const express = require('express');
const fetch = require('node-fetch');
const app = express();

// Global variables for long polling
let offset = 0;
const POLLING_INTERVAL = 1000;

// Enhanced medical system prompt
const MEDICAL_SYSTEM_PROMPT = `You are Dr. AI, a helpful medical information assistant. Follow these guidelines:

1. IMPORTANT DISCLAIMER: Always begin responses with: "I am an AI assistant providing general health information. This is not medical advice. Please consult a qualified healthcare provider for diagnosis and treatment."

2. When discussing health conditions:
   - Explain symptoms and general information
   - Discuss common evidence-based treatment approaches
   - Share relevant lifestyle modifications and wellness tips
   - Include references to medical research when applicable
   - Mention both conventional and complementary approaches
   - Explain when immediate medical attention is needed

3. For treatment discussions:
   - Focus on general treatment categories and approaches
   - Discuss lifestyle modifications
   - Explain self-care strategies
   - Mention typical treatment goals
   - Share preventive measures
   - Discuss recovery expectations

4. Always include:
   - Red flags that require immediate medical attention
   - Lifestyle and wellness recommendations
   - Preventive measures
   - When to seek professional medical help
   - Reliable medical resources for further reading

5. Communication style:
   - Use clear, simple language
   - Be empathetic and professional
   - Provide comprehensive but understandable explanations
   - Break down complex medical terms
   - Be honest about limitations of AI medical knowledge

Remember: Always emphasize the importance of consulting healthcare professionals for proper diagnosis and treatment.`;

// Function to process messages
async function processMessage(message) {
    try {
        console.log('Processing message:', message);
        
        const chatId = message.chat.id;
        const userText = message.text || 'Non-text message received';

        // Send typing indicator
        await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendChatAction`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                action: 'typing'
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
                        content: MEDICAL_SYSTEM_PROMPT
                    },
                    { role: 'user', content: userText }
                ],
                temperature: 0.7,
                max_tokens: 800 // Increased for more detailed responses
            })
        });

        const mistralData = await mistralResponse.json();
        console.log('Mistral response:', mistralData);

        if (mistralData.choices && mistralData.choices[0]) {
            const aiResponse = mistralData.choices[0].message.content;
            
            // Split long responses into multiple messages if needed
            const maxLength = 4096; // Telegram's message length limit
            if (aiResponse.length > maxLength) {
                const chunks = aiResponse.match(new RegExp(`.{1,${maxLength}}`, 'g'));
                for (const chunk of chunks) {
                    await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            chat_id: chatId,
                            text: chunk,
                            parse_mode: 'HTML'
                        })
                    });
                }
            } else {
                await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: chatId,
                        text: aiResponse,
                        parse_mode: 'HTML'
                    })
                });
            }

            // Send helpful resources message
            const resourcesMessage = `\n\nUseful Medical Resources:\n` +
                `• WHO: https://www.who.int\n` +
                `• MedlinePlus: https://medlineplus.gov\n` +
                `• CDC: https://www.cdc.gov\n\n` +
                `Remember: This information is for educational purposes only. Always consult healthcare professionals for medical advice.`;

            await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: resourcesMessage,
                    disable_web_page_preview: true
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
                    text: 'I apologize, but I encountered an error. Please try again. Remember to always consult healthcare professionals for medical advice.'
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
                offset = update.update_id + 1;
            }
        }
    } catch (error) {
        console.error('Error getting updates:', error);
    }
    
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
    
    try {
        const deleteResponse = await fetch(
            `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/deleteWebhook?drop_pending_updates=true`
        );
        const deleteResult = await deleteResponse.json();
        console.log('Deleted webhook:', deleteResult);
        
        console.log('Starting long polling...');
        getUpdates();
    } catch (error) {
        console.error('Error starting bot:', error);
    }
});
