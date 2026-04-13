/* DOM elements */
const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const chatWindow = document.getElementById("chatWindow");
const sendBtn = document.getElementById("sendBtn");

/* Cloudflare Worker URL */
const WORKER_URL = "https://openai-worker.zalmindo.workers.dev";

/* Track user details that should persist through the chat session */
const userProfile = {
  name: null,
};

/* Build the system message with any known user details */
function buildSystemPrompt() {
  let prompt = "You are a helpful L'Oreal product advisor.";

  if (userProfile.name) {
    prompt += ` The user's name is ${userProfile.name}. Use their name naturally when helpful.`;
  }

  return prompt;
}

/* Keep the conversation history for better replies */
const messages = [
  {
    role: "system",
    content: buildSystemPrompt(),
  },
];

/* Extract name from common phrases like "my name is..." */
function extractNameFromMessage(text) {
  const namePattern =
    /(?:my name is|i am|i'm|call me)\s+([a-zA-Z][a-zA-Z\-']{1,30})/i;
  const match = text.match(namePattern);

  if (!match) {
    return null;
  }

  return match[1];
}

// Set initial message
chatWindow.innerHTML = "";
appendMessage("ai", "👋 Hello! How can I help you today?");

/* Add a message bubble to the chat window */
function appendMessage(role, text) {
  const messageDiv = document.createElement("div");
  messageDiv.className = `msg ${role}`;
  messageDiv.textContent = text;
  chatWindow.appendChild(messageDiv);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return messageDiv;
}

/* Handle form submit */
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const question = userInput.value.trim();

  if (!question) {
    return;
  }

  // Show the user's message in the chat
  appendMessage("user", question);
  userInput.value = "";
  sendBtn.disabled = true;

  // Save the user's name when they share it, then refresh system context.
  const detectedName = extractNameFromMessage(question);
  if (detectedName) {
    userProfile.name = detectedName;
    messages[0].content = buildSystemPrompt();
  }

  // When using Cloudflare, you'll need to POST a `messages` array in the body,
  // and handle the response using: data.choices[0].message.content

  messages.push({
    role: "user",
    content: question,
  });

  // Temporary message while waiting for API response
  const loadingMessage = appendMessage("ai", "Thinking...");

  try {
    const response = await fetch(WORKER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messages }),
    });

    const data = await response.json();

    if (!response.ok) {
      const workerError = data?.error?.message;
      throw new Error(
        workerError || `Request failed with status ${response.status}`,
      );
    }

    // Cloudflare may return an OpenAI-style error object with status 200.
    if (data?.error?.message) {
      throw new Error(data.error.message);
    }

    const aiReply = data?.choices?.[0]?.message?.content;

    if (!aiReply) {
      throw new Error("No response text returned by the worker");
    }

    loadingMessage.textContent = aiReply;

    messages.push({
      role: "assistant",
      content: aiReply,
    });
  } catch (error) {
    console.error("Chat request error:", error);
    loadingMessage.textContent = `Sorry, I could not get a response right now. ${error.message}`;
  } finally {
    sendBtn.disabled = false;
    userInput.focus();
  }
});
