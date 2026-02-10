"use client";
import Head from "next/head";
import Link from "next/link";
import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";

// Strict HTML sanitization schema - only allow safe tags needed for formatting
const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames || []),
    'u', // underline for totals
  ],
  attributes: {
    ...defaultSchema.attributes,
    // Only allow safe attributes, no event handlers
    '*': ['className'],
    'a': ['href', 'target', 'rel'],
    'img': ['src', 'alt'],
  },
  // Block all protocols except safe ones
  protocols: {
    href: ['http', 'https', 'mailto'],
    src: ['http', 'https', '/'],
  },
};

const createId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `msg-${Date.now()}-${Math.random()}`;

const flattenNodeText = (node) => {
  if (node == null) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(flattenNodeText).join("");
  if (typeof node === "object" && node.props?.children !== undefined) {
    return flattenNodeText(node.props.children);
  }
  return "";
};

const isStepIndicator = (text) => /^step\s*\d+\s*of\s*\d+\s*[—-]/i.test(text.trim());
const parseStepIndicator = (text) => {
  const match = text.trim().match(/^step\s*(\d+)\s*of\s*(\d+)\s*[—-]\s*(.+)$/i);
  if (!match) return null;
  return { current: match[1], total: match[2], title: match[3] };
};
const isSummaryTitleLine = (text) => /^summary$/i.test(text.trim()) || /^✓\s*renewal summary\b/i.test(text.trim());
const isSummaryDividerLine = (text) => /^[─-]{8,}$/.test(text.trim());
const isSummaryTotalLine = (text) => /^(?:💰\s*)?total:\s*rm\s*\d[\d,]*/i.test(text.trim());

export default function Home() {
  const [inputText, setInputText] = useState("");
  const [messages, setMessages] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const threadRef = useRef(null);
  const inputRef = useRef(null);
  const scrollToUserMessageRef = useRef(false);
  const pendingScrollRef = useRef(null); // Store pending scroll ID in ref
  const lastRequestRef = useRef(null); // Store last request for retry
  const conversationStateRef = useRef(null); // Server state round-tripped each turn
  const searchParams = useSearchParams();
  const sessionKey = searchParams.get("session") || "default";
  const stateStorageKey = `lajoo_state_${sessionKey}`;
  const params = useParams();
  const country = (params?.country || "my").toLowerCase();

  const hasMessages = messages.length > 0;

  // Check if user has scrolled up
  const handleScroll = useCallback(() => {
    if (!threadRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = threadRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
    setShowScrollButton(!isNearBottom);
  }, []);

  // Scroll to bottom
  const scrollToBottom = useCallback(() => {
    if (!threadRef.current) return;
    threadRef.current.scrollTo({
      top: threadRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, []);

  // Execute the scroll to user message
  const executeScrollToUserMessage = useCallback((messageId) => {
    const container = threadRef.current;
    const userMessageEl = document.getElementById(`msg-${messageId}`);

    if (container && userMessageEl) {
      // Calculate the scroll position to put user message at top of container
      const containerRect = container.getBoundingClientRect();
      const messageRect = userMessageEl.getBoundingClientRect();

      // How far is the message from the top of the container
      const messageOffsetFromContainerTop = messageRect.top - containerRect.top;

      // New scroll position = current scroll + offset - small padding
      const newScrollTop = container.scrollTop + messageOffsetFromContainerTop - 20;

      // Use instant scroll
      container.scrollTop = Math.max(0, newScrollTop);
      setShowScrollButton(false);

      // Clear pending
      pendingScrollRef.current = null;

      // Keep lock for 2 seconds to prevent streaming scroll override
      setTimeout(() => {
        scrollToUserMessageRef.current = false;
      }, 2000);

      return true;
    }
    return false;
  }, []);

  // Watch for messages changes and execute pending scroll
  useEffect(() => {
    if (!pendingScrollRef.current) return;

    // Mark that we're scrolling
    scrollToUserMessageRef.current = true;

    // Try to scroll - use multiple attempts since DOM may not be ready
    const attemptScroll = (attempts = 0) => {
      if (attempts > 10) {
        // Give up after 10 attempts
        pendingScrollRef.current = null;
        scrollToUserMessageRef.current = false;
        return;
      }

      // Wait for next frame then try
      requestAnimationFrame(() => {
        if (!pendingScrollRef.current) return;

        const success = executeScrollToUserMessage(pendingScrollRef.current);
        if (!success) {
          // Retry after a short delay
          setTimeout(() => attemptScroll(attempts + 1), 50);
        }
      });
    };

    attemptScroll();
  }, [messages, executeScrollToUserMessage]);

  // Auto-scroll during streaming to keep AI response visible
  // This effect is DISABLED while scrolling to user message
  useEffect(() => {
    // Skip if we're scrolling to user message
    if (scrollToUserMessageRef.current) return;
    if (!threadRef.current || !isStreaming) return;

    const timeoutId = setTimeout(() => {
      if (scrollToUserMessageRef.current || !threadRef.current) return;

      const { scrollTop, scrollHeight, clientHeight } = threadRef.current;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 300;

      if (isNearBottom) {
        threadRef.current.scrollTo({
          top: threadRef.current.scrollHeight,
          behavior: "smooth",
        });
        setShowScrollButton(false);
      }
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [messages, isStreaming]);

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || isStreaming) return;

    // Check if user wants to restart/new chat
    const isRestartCommand = /^(restart|start over|new chat|mula semula|clear)$/i.test(text);
    if (isRestartCommand) {
      setInputText("");
      if (inputRef.current) inputRef.current.style.height = 'auto';
      clearChat();
      return;
    }

    // Check if user wants to retry
    const isRetryCommand = /^(retry|try again|cuba lagi)$/i.test(text);
    if (isRetryCommand && lastRequestRef.current) {
      setInputText("");
      if (inputRef.current) inputRef.current.style.height = 'auto';
      await handleRetry();
      return;
    }

    const userMessage = { id: createId(), role: "user", content: text };
    const history = [...messages, userMessage];
    const assistantId = createId();

    // Store request for potential retry
    lastRequestRef.current = { history, assistantId };

    // Set pending scroll BEFORE updating messages
    pendingScrollRef.current = userMessage.id;
    scrollToUserMessageRef.current = true;

    setMessages([...history, { id: assistantId, role: "assistant", content: "" }]);
    setInputText("");
    setError(null);
    // Reset textarea height
    if (inputRef.current) inputRef.current.style.height = 'auto';

    await streamReply(history, assistantId);
  };

  const handleRetry = async () => {
    if (!lastRequestRef.current || isStreaming) return;

    const { history } = lastRequestRef.current;
    const newAssistantId = createId();

    // Update the stored request with new assistant ID
    lastRequestRef.current.assistantId = newAssistantId;

    // Remove the last failed assistant message and add a new one
    setMessages((prev) => {
      const filtered = prev.filter((msg) => msg.role !== "assistant" || msg.content !== "");
      // Remove the last assistant message if it was an error
      const lastMsg = filtered[filtered.length - 1];
      if (lastMsg?.role === "assistant" && lastMsg.content.includes("try again")) {
        filtered.pop();
      }
      return [...filtered, { id: newAssistantId, role: "assistant", content: "" }];
    });

    setError(null);
    await streamReply(history, newAssistantId);
  };

  // Clear chat and start fresh
  const clearChat = () => {
    setMessages([]);
    setInputText("");
    setError(null);
    conversationStateRef.current = null;
    localStorage.removeItem(`lajoo_chat_${sessionKey}`);
    localStorage.removeItem(stateStorageKey);
    if (inputRef.current) inputRef.current.style.height = 'auto';
  };

  // Load saved conversation from localStorage on mount/session change
  // Clear chat on fresh navigation (when user types URL directly or refreshes)
  useEffect(() => {
    const storageKey = `lajoo_chat_${sessionKey}`;
    const savedStateRaw = localStorage.getItem(stateStorageKey);

    // Check navigation type using modern Performance API
    const navEntries = performance?.getEntriesByType?.("navigation");
    const navType = navEntries?.[0]?.type;

    // "navigate" = user typed URL or clicked link from external site
    // "reload" = user refreshed the page
    // "back_forward" = user used browser back/forward buttons
    const isFreshStart = navType === "navigate" || navType === "reload";

    // Clear chat on fresh navigation or reload
    if (isFreshStart) {
      localStorage.removeItem(storageKey);
      localStorage.removeItem(stateStorageKey);
      conversationStateRef.current = null;
      setMessages([]);
      setInputText("");
      if (inputRef.current) inputRef.current.style.height = 'auto';
      return;
    }

    // Restore server-side conversation state first (if present)
    if (savedStateRaw) {
      try {
        const parsedState = JSON.parse(savedStateRaw);
        if (parsedState && typeof parsedState === 'object') {
          conversationStateRef.current = parsedState;
        }
      } catch (e) {
        console.error('Error loading saved state:', e);
        localStorage.removeItem(stateStorageKey);
        conversationStateRef.current = null;
      }
    } else {
      conversationStateRef.current = null;
    }

    // Otherwise, try to restore saved conversation (e.g., back/forward navigation)
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
          return;
        }
      } catch (e) {
        console.error('Error loading saved chat:', e);
        localStorage.removeItem(storageKey);
      }
    }
    // Clear if no saved messages or new session
    conversationStateRef.current = null;
    localStorage.removeItem(stateStorageKey);
    setMessages([]);
    setInputText("");
    if (inputRef.current) inputRef.current.style.height = 'auto';
  }, [sessionKey, stateStorageKey]);

  // Save conversation to localStorage when messages change
  useEffect(() => {
    if (messages.length > 0) {
      // Only save complete messages (not empty streaming messages)
      const completeMessages = messages.filter(m => m.content && m.content.trim() !== "");
      if (completeMessages.length > 0) {
        localStorage.setItem(`lajoo_chat_${sessionKey}`, JSON.stringify(completeMessages));
      }
    }
  }, [messages, sessionKey]);

  // Listen for payment success from payment tab via localStorage
  useEffect(() => {
    const showPaymentSuccess = (data) => {
      const successMessage = {
        id: createId(),
        role: "assistant",
        content: `🎉 **Payment Successful!**

Thank you for your payment of **RM ${Number(data.total).toLocaleString()}**!

---
**Order Confirmation**
**Reference:** ${data.paymentId}
**Insurer:** ${data.insurer}
**Vehicle:** ${data.plate}
**Insurance:** RM ${Number(data.insurance).toLocaleString()}
${Number(data.addons) > 0 ? `**Add-ons:** RM ${Number(data.addons).toLocaleString()}` : ''}
${Number(data.roadtax) > 0 ? `**Road Tax:** RM ${Number(data.roadtax).toLocaleString()}` : ''}
**Total Paid:** RM ${Number(data.total).toLocaleString()}

---

✅ Your policy documents have been sent to your **WhatsApp** and **email**.

📄 **Download your documents:**
- [**Insurance Policy (PDF)**](/documents/policy-${data.paymentId}.pdf)
- [**Road Tax Receipt (PDF)**](/documents/roadtax-${data.paymentId}.pdf)

Your coverage starts immediately. Drive safe! 🚗`
      };

      setMessages(prev => [...prev, successMessage]);

      // Scroll to bottom after adding success message
      setTimeout(() => {
        if (threadRef.current) {
          threadRef.current.scrollTo({
            top: threadRef.current.scrollHeight,
            behavior: "smooth",
          });
        }
      }, 100);
    };

    // Listen for localStorage changes (from payment tab)
    const handleStorageChange = (event) => {
      if (event.key === 'lajoo_payment_success' && event.newValue) {
        try {
          const paymentData = JSON.parse(event.newValue);
          if (paymentData.type === 'PAYMENT_SUCCESS' && paymentData.data) {
            showPaymentSuccess(paymentData.data);
            // Clear the localStorage after processing
            localStorage.removeItem('lajoo_payment_success');
          }
        } catch (e) {
          console.error('Error parsing payment success data:', e);
        }
      }
    };

    // Also check on focus (in case user manually closes tab)
    const handleFocus = () => {
      const stored = localStorage.getItem('lajoo_payment_success');
      if (stored) {
        try {
          const paymentData = JSON.parse(stored);
          // Only process if it's recent (within last 30 seconds)
          if (paymentData.type === 'PAYMENT_SUCCESS' && paymentData.data &&
              Date.now() - paymentData.timestamp < 30000) {
            showPaymentSuccess(paymentData.data);
            localStorage.removeItem('lajoo_payment_success');
          } else {
            // Clear stale data
            localStorage.removeItem('lajoo_payment_success');
          }
        } catch (e) {
          console.error('Error parsing payment success data:', e);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  const streamReply = async (history, assistantId) => {
    setIsStreaming(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.map(({ role, content }) => ({ role, content })),
          state: conversationStateRef.current || null,
        }),
      });

      if (!response.ok || !response.body) throw new Error("Our chat service is unavailable right now.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;

        const chunk = decoder.decode(value, { stream: true });
        const events = chunk.split("\n\n").filter(Boolean);

        for (const event of events) {
          if (!event.startsWith("data:")) continue;
          const data = JSON.parse(event.slice(5).trim());

          if (data.type === "chunk" && data.content) {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantId ? { ...msg, content: msg.content + data.content } : msg
              )
            );
          } else if (data.type === "error") {
            const rawError = data.message || "Something went wrong.";
            const userMessage = /OPENAI_API_KEY/i.test(rawError)
              ? "LAJOO is not configured yet. Please set a valid OPENAI API key and restart your app."
              : rawError;
            setError(rawError);
            setMessages((prev) =>
              prev.map((msg) => (msg.id === assistantId ? { ...msg, content: userMessage } : msg))
            );
            setIsStreaming(false);
            return;
          } else if (data.type === "done" && data.reply) {
            // Clean any remaining markers from the response
            const cleanedReply = data.reply
              .replace(/\[SHOW_QUOTES\]/g, "")
              .replace(/\[SHOW_ADDONS\]/g, "")
              .replace(/\[SHOW_ROADTAX\]/g, "")
              .replace(/\[SHOW_PERSONAL_FORM\]/g, "")
              .replace(/\[SHOW_OTP\]/g, "")
              .replace(/\[SHOW_PAYMENT\]/g, "")
              .replace(/\[SHOW_SUCCESS\]/g, "")
              .trim();

            setMessages((prev) =>
              prev.map((msg) => (msg.id === assistantId ? { ...msg, content: cleanedReply } : msg))
            );

            // Persist server state so we can send it back next turn
            if (data.state) {
              conversationStateRef.current = data.state;
              localStorage.setItem(stateStorageKey, JSON.stringify(data.state));
            }
          }
        }
      }
    } catch (err) {
      console.error(err);
      const rawError = err.message || "Unable to reach LAJOO.";
      const userMessage = /OPENAI_API_KEY/i.test(rawError)
        ? "LAJOO is not configured yet. Please set a valid OPENAI API key and restart your app."
        : "Sorry, I could not reach our insurer partner. Please try again.";
      setError(rawError);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantId
            ? { ...msg, content: userMessage }
            : msg
        )
      );
    } finally {
      setIsStreaming(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleQuickStart = (text) => {
    if (isStreaming) return;
    const trimmed = text.trim();
    if (!trimmed) return;

    const userMessage = { id: createId(), role: "user", content: trimmed };
    const history = [...messages, userMessage];
    const assistantId = createId();

    // Set pending scroll BEFORE updating messages
    pendingScrollRef.current = userMessage.id;
    scrollToUserMessageRef.current = true;

    setMessages([...history, { id: assistantId, role: "assistant", content: "" }]);
    setInputText("");
    // Reset textarea height
    if (inputRef.current) inputRef.current.style.height = 'auto';
    streamReply(history, assistantId);
  };

  return (
    <>
      <Head>
        <title>Renew Insurance In Minutes With LAJOO</title>
      </Head>

      <main className={`hero ${hasMessages ? "hero-chatting" : ""}`}>
        {!hasMessages && (
          <div className="hero-content">
            <h1>
              Instant Car Insurance <br />
              &amp; Road Tax Renewal
            </h1>
            <h2>
              Get covered in 2 minutes, <br />
              fully AI-powered.
            </h2>

            <div className="recommended-actions">
              <button onClick={() => handleQuickStart("Renew Insurance")}>Renew Insurance</button>
              <button onClick={() => handleQuickStart("View My Policy")}>View My Policy</button>
              <button onClick={() => handleQuickStart("Make A Claim")}>Make A Claim</button>
              <button onClick={() => handleQuickStart("Accident Help")}>Accident Help</button>
            </div>
          </div>
        )}

        {hasMessages && (
          <div
            className="chat-container"
            ref={threadRef}
            onScroll={handleScroll}
          >
            <div className="chat-feed">
              {messages.map((msg) => {
                // Clean markers from displayed content
                const cleanedContent = (msg.content || "")
                  .replace(/\[SHOW_QUOTES\]/g, "")
                  .replace(/\[SHOW_ADDONS\]/g, "")
                  .replace(/\[SHOW_ROADTAX\]/g, "")
                  .replace(/\[SHOW_PERSONAL_FORM\]/g, "")
                  .replace(/\[SHOW_OTP\]/g, "")
                  .replace(/\[SHOW_PAYMENT\]/g, "")
                  .replace(/\[SHOW_SUCCESS\]/g, "")
                  .trim();

                return (
                  <div key={msg.id} id={`msg-${msg.id}`} className={`chat-row ${msg.role}`}>
                    <div className="chat-content">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
                        components={{
                          a: ({ href, children }) => {
                            // Open payment links in new tab
                            const isPaymentLink = href && href.includes('/payment/');
                            return (
                              <a
                                href={href}
                                target={isPaymentLink ? "_blank" : "_self"}
                                rel={isPaymentLink ? "noopener noreferrer" : undefined}
                              >
                                {children}
                              </a>
                            );
                          },
                          p: ({ children, className }) => {
                            const text = flattenNodeText(children).trim();
                            if (isStepIndicator(text)) {
                              const parsed = parseStepIndicator(text);
                              if (parsed) {
                                return (
                                  <p className="chat-step-indicator">
                                    Step <strong>{parsed.current}</strong> of <strong>{parsed.total}</strong> — {parsed.title}
                                  </p>
                                );
                              }
                              return <p className="chat-step-indicator">{children}</p>;
                            }
                            if (isSummaryTitleLine(text)) {
                              return <p className="summary-title">{children}</p>;
                            }
                            if (isSummaryDividerLine(text)) {
                              return <p className="summary-divider">{children}</p>;
                            }
                            if (isSummaryTotalLine(text)) {
                              return <p className="summary-total">{children}</p>;
                            }
                            return <p className={className}>{children}</p>;
                          },
                        }}
                      >
                        {cleanedContent}
                      </ReactMarkdown>
                    </div>
                  </div>
                );
              })}

              {isStreaming && (
                <div className="chat-row assistant typing">
                  <div className="chat-content">
                    <span className="dot" />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Scroll to bottom button */}
      {hasMessages && showScrollButton && (
        <button
          className="scroll-to-bottom"
          onClick={scrollToBottom}
          aria-label="Scroll to bottom"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12l7 7 7-7" />
          </svg>
        </button>
      )}

      {error && (
        <div className="chat-status">
          <p className="chat-error">Something went wrong. Would you like me to try again?</p>
          <button className="retry-button" onClick={handleRetry} disabled={isStreaming}>
            Try Again
          </button>
        </div>
      )}

      <div className="chat-input-wrapper">
        <div className="chat-box">
          <div className="chat-column">
            <div className="bubble">
              <button className="add-button" aria-label="Add attachments">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              <textarea
                ref={inputRef}
                className="input-area"
                aria-label="Chat with LAJOO"
                placeholder="Renew or ask anything"
                value={inputText}
                onChange={(e) => {
                  setInputText(e.target.value);
                  // Auto-resize textarea
                  e.target.style.height = 'auto';
                  e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                }}
                onKeyDown={handleKeyDown}
                rows={1}
              />

              <button
                type="button"
                className={`send-button ${inputText.trim() && !isStreaming ? "active" : ""}`}
                onClick={handleSend}
                disabled={!inputText.trim() || isStreaming}
                aria-label="Send message"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>

          <div className="terms-privacy">
            <p>
              By messaging LAJOO, you agree to our{" "}
              <Link href={`/${country}/terms`} className="terms-link">
                Terms &amp; Privacy Policy
              </Link>
              .
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
