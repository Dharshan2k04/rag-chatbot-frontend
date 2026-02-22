import { useState, useEffect, useRef } from "react";
import ModernSidebar from "./components/ModernSidebar";
import ChatMessage from "./components/ChatMessage";
import DocumentMessage from "./components/DocumentMessage";
import ModernChatInput from "./components/ModernChatInput";
import LoadingSkeleton from "./components/LoadingSkeleton";
import api from "./api";
import { motion, AnimatePresence } from "framer-motion";

function App() {
  const [chatId, setChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [useStreaming, setUseStreaming] = useState(true); // Enable streaming by default
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const startNewChat = async () => {
    try {
      const res = await api.post("/chat/new");
      setChatId(res.data.chat_id);
      setMessages([]);
    } catch (err) {
      console.error("Error creating new chat:", err);
      alert("Failed to create new chat. Make sure the backend is running!");
    }
  };

  const loadChat = async (id) => {
    try {
      setChatId(id);
      const res = await api.get(`/chat/${id}/messages`);
      
      const formattedMessages = res.data.messages.map((msg) => ({
        role: msg.role,
        message: msg.message,
      }));
      
      setMessages(formattedMessages);
    } catch (err) {
      console.error("Error loading chat:", err);
      alert("Failed to load chat");
    }
  };

  useEffect(() => {
    startNewChat();
  }, []);

  const handleDocumentUploaded = (document) => {
    const docMessage = {
      role: "document",
      document: document,
    };
    setMessages((prev) => [...prev, docMessage]);
  };

  const sendMessageStreaming = async (input, isRegenerate = false) => {
    if (!input.trim() || !chatId || loading) return;

    if (!isRegenerate) {
      const userMsg = { role: "user", message: input };
      setMessages((prev) => [...prev, userMsg]);
    } else {
      setMessages((prev) => prev.slice(0, -1));
    }

    setLoading(true);

    try {
      // Create initial AI message
      const aiMsgId = Date.now();
      setMessages((prev) => [
        ...prev,
        { id: aiMsgId, role: "assistant", message: "" },
      ]);

      // Use fetch with streaming
      const response = await fetch(
        `http://127.0.0.1:8000/chat/${chatId}/stream?query=${encodeURIComponent(input)}&regenerate=${isRegenerate}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Streaming request failed');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          setLoading(false);
          break;
        }

        // Decode the chunk
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.done) {
                setLoading(false);
              } else if (data.token) {
                // Append token to message
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === aiMsgId
                      ? { ...msg, message: msg.message + data.token }
                      : msg
                  )
                );
              }
            } catch (err) {
              console.error("Error parsing stream:", err);
            }
          }
        }
      }
      } catch (err) {
      console.error(err);
      setLoading(false);
      const errorMsgId = Date.now();
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === errorMsgId && !msg.message
            ? { ...msg, message: "Sorry, I encountered an error. Please try again." }
            : msg
        )
      );
    }
  };

  const sendMessageNonStreaming = async (input, isRegenerate = false) => {
    if (!input.trim() || !chatId || loading) return;

    if (!isRegenerate) {
      const userMsg = { role: "user", message: input };
      setMessages((prev) => [...prev, userMsg]);
    } else {
      setMessages((prev) => prev.slice(0, -1));
    }

    setLoading(true);

    try {
      const res = await api.post(
        `/chat/${chatId}?query=${encodeURIComponent(input)}&regenerate=${isRegenerate}`
      );

      const aiMsg = { role: "assistant", message: res.data.answer };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          message: "Sorry, I encountered an error. Please try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = (input, isRegenerate = false) => {
    if (useStreaming) {
      return sendMessageStreaming(input, isRegenerate);
    } else {
      return sendMessageNonStreaming(input, isRegenerate);
    }
  };

  const handleRegenerate = async () => {
    if (messages.length < 2) return;

    const lastUserMsg = [...messages]
      .reverse()
      .find((msg) => msg.role === "user");

    if (!lastUserMsg) return;

    await sendMessage(lastUserMsg.message, true);
  };

  return (
    <div className="flex h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-white transition-colors">
      <ModernSidebar
        onNewChat={startNewChat}
        currentChatId={chatId}
        onSelectChat={loadChat}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="border-b dark:border-gray-800 bg-white dark:bg-gray-900 p-4 backdrop-blur-sm bg-opacity-80">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <h1 className="text-xl font-semibold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              RAG Chatbot
            </h1>
            <div className="flex items-center gap-4">
              {/* Streaming Toggle */}
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={useStreaming}
                  onChange={(e) => setUseStreaming(e.target.checked)}
                  className="w-4 h-4"
                />
                <span className="text-gray-600 dark:text-gray-400">
                  ⚡ Streaming {useStreaming ? "ON" : "OFF"}
                </span>
              </label>
              
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-sm text-gray-500">Online</span>
              </div>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          <AnimatePresence>
            {messages.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="h-full flex items-center justify-center"
              >
                <div className="text-center space-y-4 p-8">
                  <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-purple-600 rounded-2xl mx-auto flex items-center justify-center">
                    <svg
                      className="w-8 h-8 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                      />
                    </svg>
                  </div>
                  <h2 className="text-2xl font-semibold">
                    Welcome to RAG Chatbot
                  </h2>
                  <p className="text-gray-500 max-w-md">
                    Upload a document using the + button below and start asking
                    questions. Streaming is enabled for instant responses!
                  </p>
                </div>
              </motion.div>
            ) : (
              messages.map((msg, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  {msg.role === "document" ? (
                    <DocumentMessage document={msg.document} />
                  ) : (
                    <ChatMessage
                      message={msg}
                      onRegenerate={
                        idx === messages.length - 1 && msg.role === "assistant"
                          ? handleRegenerate
                          : null
                      }
                      isLatest={idx === messages.length - 1}
                    />
                  )}
                </motion.div>
              ))
            )}
          </AnimatePresence>

          {loading && <LoadingSkeleton />}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <ModernChatInput
          chatId={chatId}
          onSendMessage={(input) => sendMessage(input, false)}
          onDocumentUploaded={handleDocumentUploaded}
          disabled={loading}
        />
      </div>
    </div>
  );
}

export default App;