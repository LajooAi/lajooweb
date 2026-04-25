"use client";
import Head from "next/head";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import EqualWidthTitle from "@/components/EqualWidthTitle";

// Strict HTML sanitization schema - only allow safe tags needed for formatting
const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames || []),
    'u', // underline for totals
    'span', // inline styling (e.g. divider opacity)
  ],
  attributes: {
    ...defaultSchema.attributes,
    // Only allow safe attributes, no event handlers
    '*': [...(defaultSchema.attributes['*'] || []), 'className', 'style'],
    'span': ['style'],
    'a': ['href', 'target', 'rel', 'download'],
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
const isSummaryDividerLine = (text) => /^[\-_─—–]{8,}$/.test(text.trim());
const isSummaryTotalLine = (text) => /^(?:💰\s*)?total:\s*rm\s*\d[\d,]*/i.test(text.trim());

const HERO_INSURER_LOGOS = [
  { id: "allianz", name: "Allianz", src: "/partners/allianz.svg" },
  { id: "etiqa", name: "Etiqa", src: "/partners/etiqa.svg" },
  { id: "takaful", name: "Takaful", src: "/partners/takaful.svg" },
  { id: "lonpac", name: "Lonpac", src: "/partners/lonpac.svg" },
  { id: "msig", name: "MSIG", src: "/partners/msig.svg" },
];

function HeroTypeIcon({ src, alt, fallback }) {
  const [failedToLoad, setFailedToLoad] = useState(false);

  if (failedToLoad) {
    return <span className="home-hero-type-fallback" aria-hidden>{fallback}</span>;
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={220}
      height={220}
      sizes="(min-width: 1024px) 178px, 100px"
      quality={100}
      className="home-hero-type-img"
      onError={() => setFailedToLoad(true)}
    />
  );
}

export default function Home() {
  const [inputText, setInputText] = useState("");
  const [messages, setMessages] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState(null);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isTurnAnchoring, setIsTurnAnchoring] = useState(false);
  const [anchorSpacerPx, setAnchorSpacerPx] = useState(0);
  const [heroInsurerLoopWidth, setHeroInsurerLoopWidth] = useState(0);
  const threadRef = useRef(null);
  const homeMainRef = useRef(null);
  const heroInsurerGroupRef = useRef(null);
  const inputRef = useRef(null);
  const addButtonRef = useRef(null);
  const addMenuRef = useRef(null);
  const takePhotoInputRef = useRef(null);
  const addPhotosInputRef = useRef(null);
  const attachPdfInputRef = useRef(null);
  const scrollToUserMessageRef = useRef(false);
  const pendingScrollRef = useRef(null); // Store pending scroll ID in ref
  const anchorSpacerPxRef = useRef(0);
  const anchorStableCountRef = useRef(0);
  const anchorHoldUntilRef = useRef(0);
  const keepTurnAnchoredRef = useRef(false);
  const lastRequestRef = useRef(null); // Store last request for retry
  const conversationStateRef = useRef(null); // Server state round-tripped each turn
  const processedPaymentsRef = useRef(new Set()); // Avoid duplicate payment success messages
  const searchParams = useSearchParams();
  const sessionKey = searchParams.get("session") || "default";
  const paymentStatus = searchParams.get("payment");
  const stateStorageKey = `lajoo_state_${sessionKey}`;
  const params = useParams();
  const country = (params?.country || "my").toLowerCase();

  useEffect(() => {
    const group = heroInsurerGroupRef.current;
    if (!group) return undefined;

    const updateLoopWidth = () => {
      setHeroInsurerLoopWidth(group.getBoundingClientRect().width);
    };

    updateLoopWidth();

    if (typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const resizeObserver = new ResizeObserver(() => {
      updateLoopWidth();
    });

    resizeObserver.observe(group);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  const hasMessages = messages.length > 0;
  const USER_MESSAGE_TOP_OFFSET = 4;
  const MAX_USER_ANCHOR_ATTEMPTS = 120;

  const stopTurnAnchoring = useCallback((clearSpacer = true) => {
    setIsTurnAnchoring(false);
    pendingScrollRef.current = null;
    scrollToUserMessageRef.current = false;
    anchorStableCountRef.current = 0;
    anchorHoldUntilRef.current = 0;
    if (clearSpacer) {
      keepTurnAnchoredRef.current = false;
    }
    if (clearSpacer) {
      setAnchorSpacerPx(0);
      anchorSpacerPxRef.current = 0;
    }
  }, []);

  const resetHomePosition = useCallback(() => {
    if (hasMessages) return;

    requestAnimationFrame(() => {
      if (homeMainRef.current) {
        homeMainRef.current.scrollTop = 0;
      }
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
  }, [hasMessages]);

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

    if (!container || !userMessageEl) return false;

    // Use rect delta relative to the actual scroll container (more reliable on mobile Safari).
    const containerRect = container.getBoundingClientRect();
    const messageRect = userMessageEl.getBoundingClientRect();
    const deltaToTarget = messageRect.top - containerRect.top - USER_MESSAGE_TOP_OFFSET;
    const targetScrollTop = Math.max(0, container.scrollTop + deltaToTarget);
    let maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);

    // If target is currently unreachable, add temporary bottom spacer so the turn can anchor.
    const neededExtra = targetScrollTop - maxScrollTop;
    if (neededExtra > 0) {
      const desiredSpacer = Math.ceil(
        Math.min(
          Math.max(anchorSpacerPxRef.current, neededExtra),
          container.clientHeight * 2.5
        )
      );
      if (desiredSpacer > anchorSpacerPxRef.current + 2) {
        anchorSpacerPxRef.current = desiredSpacer;
        setAnchorSpacerPx(desiredSpacer);
      }
      maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
    }

    const boundedScrollTop = Math.min(maxScrollTop, targetScrollTop);

    if (Math.abs(container.scrollTop - boundedScrollTop) > 0.5) {
      container.scrollTop = boundedScrollTop;
    }
    setShowScrollButton(false);

    // Reached only when the user bubble is visually anchored near top.
    const topAfterScroll =
      userMessageEl.getBoundingClientRect().top - container.getBoundingClientRect().top;
    const reachedTop = Math.abs(topAfterScroll - USER_MESSAGE_TOP_OFFSET) <= 3;

    return reachedTop;
  }, [USER_MESSAGE_TOP_OFFSET]);

  // Watch for messages changes and execute pending scroll
  useEffect(() => {
    if (!pendingScrollRef.current) return;

    let cancelled = false;
    let timerId;
    scrollToUserMessageRef.current = true;

    const attemptScroll = (attempts = 0) => {
      if (cancelled) return;
      requestAnimationFrame(() => {
        if (cancelled) return;
        if (!pendingScrollRef.current) return;

        const success = executeScrollToUserMessage(pendingScrollRef.current);

        if (success) {
          anchorStableCountRef.current += 1;
        } else {
          anchorStableCountRef.current = 0;
        }

        const holdElapsed = Date.now() >= anchorHoldUntilRef.current;
        const stableEnough =
          success && holdElapsed && anchorStableCountRef.current >= 2;

        if (stableEnough) {
          pendingScrollRef.current = null;
          scrollToUserMessageRef.current = false;
          setIsTurnAnchoring(false);
          anchorStableCountRef.current = 0;
          return;
        }

        // Keep nudging for the whole turn; release is handled in stream `finally`.
        const reachedAttemptLimit = !isStreaming && !success && attempts >= MAX_USER_ANCHOR_ATTEMPTS;
        if (reachedAttemptLimit) {
          stopTurnAnchoring(true);
          return;
        }

        timerId = setTimeout(() => attemptScroll(attempts + 1), isStreaming ? 60 : 50);
      });
    };

    attemptScroll();

    return () => {
      cancelled = true;
      if (timerId) clearTimeout(timerId);
    };
  }, [
    messages,
    isStreaming,
    executeScrollToUserMessage,
    MAX_USER_ANCHOR_ATTEMPTS,
    stopTurnAnchoring,
  ]);

  // Mobile viewport can resize when keyboard/browser chrome changes. Re-anchor current turn.
  useEffect(() => {
    if (!hasMessages) return;

    const handleViewportShift = () => {
      if (!pendingScrollRef.current) return;
      executeScrollToUserMessage(pendingScrollRef.current);
    };

    window.addEventListener("resize", handleViewportShift);
    window.addEventListener("orientationchange", handleViewportShift);
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", handleViewportShift);
    viewport?.addEventListener("scroll", handleViewportShift);

    return () => {
      window.removeEventListener("resize", handleViewportShift);
      window.removeEventListener("orientationchange", handleViewportShift);
      viewport?.removeEventListener("resize", handleViewportShift);
      viewport?.removeEventListener("scroll", handleViewportShift);
    };
  }, [hasMessages, executeScrollToUserMessage]);

  // Auto-scroll during streaming to keep AI response visible
  // This effect is DISABLED while scrolling to user message
  useEffect(() => {
    // Skip if we're scrolling to user message
    if (scrollToUserMessageRef.current) return;
    // Keep user bubble pinned at top for anchored turns (ChatGPT-like behavior)
    if (keepTurnAnchoredRef.current) return;
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

  const triggerAttachmentPicker = useCallback((pickerType) => {
    setIsAddMenuOpen(false);

    if (pickerType === "camera") {
      takePhotoInputRef.current?.click();
      return;
    }
    if (pickerType === "photos") {
      addPhotosInputRef.current?.click();
      return;
    }
    if (pickerType === "pdf") {
      attachPdfInputRef.current?.click();
    }
  }, []);

  const handleAttachmentSelection = useCallback((event) => {
    // Picker is functional now; attachment transport can be wired to backend later.
    if (event.target.files?.length) {
      event.target.value = "";
    }
  }, []);

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
    keepTurnAnchoredRef.current = true;
    setIsTurnAnchoring(true);
    anchorSpacerPxRef.current = 0;
    setAnchorSpacerPx(0);
    anchorStableCountRef.current = 0;
    anchorHoldUntilRef.current = Date.now() + 280;

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
    stopTurnAnchoring(true);
    conversationStateRef.current = null;
    localStorage.removeItem(`lajoo_chat_${sessionKey}`);
    localStorage.removeItem(stateStorageKey);
    if (inputRef.current) inputRef.current.style.height = 'auto';
  };

  // Load saved conversation from localStorage on mount/session change.
  // Default behavior: hard refresh/new navigation starts a fresh chat.
  // Exception: preserve chat when returning from payment flow.
  useEffect(() => {
    const storageKey = `lajoo_chat_${sessionKey}`;
    const savedStateRaw = localStorage.getItem(stateStorageKey);
    const pendingPaymentSuccess = localStorage.getItem("lajoo_payment_success");
    const navEntries = performance?.getEntriesByType?.("navigation");
    const navType = navEntries?.[0]?.type;
    const isHardLoad = navType === "navigate" || navType === "reload";
    const isPaymentReturn = paymentStatus === "success" || !!pendingPaymentSuccess;

    if (isHardLoad && !isPaymentReturn) {
      localStorage.removeItem(storageKey);
      localStorage.removeItem(stateStorageKey);
      conversationStateRef.current = null;
      setMessages([]);
      setInputText("");
      if (inputRef.current) inputRef.current.style.height = "auto";
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

    // Restore saved conversation when available.
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
    // No saved chat for this session: start blank without clearing unrelated sessions.
    conversationStateRef.current = null;
    localStorage.removeItem(stateStorageKey);
    setMessages([]);
    setInputText("");
    if (inputRef.current) inputRef.current.style.height = 'auto';
  }, [sessionKey, stateStorageKey, paymentStatus]);

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
    const formatMoney = (value) => {
      const n = Number(value);
      return Number.isFinite(n) ? n.toLocaleString() : "0";
    };

    const showPaymentSuccess = (data) => {
      if (!data || !data.paymentId) return;
      if (processedPaymentsRef.current.has(data.paymentId)) return;
      processedPaymentsRef.current.add(data.paymentId);

      const successMessage = {
        id: createId(),
        role: "assistant",
        content: `🎉 **Payment Successful!**

Thank you for your payment of **RM ${formatMoney(data.total)}**!

**Order Confirmation**
<span style="display:block"><strong>Reference:</strong> ${data.paymentId}</span>
<span style="display:block"><strong>Insurer:</strong> ${data.insurer}</span>
<span style="display:block"><strong>Vehicle:</strong> ${data.plate}</span>
<span style="display:block"><strong>Insurance:</strong> RM ${formatMoney(data.insurance)}</span>
${Number(data.addons) > 0 ? `<span style="display:block"><strong>Add-ons:</strong> RM ${formatMoney(data.addons)}</span>` : ''}
${Number(data.roadtax) > 0 ? `<span style="display:block"><strong>Road Tax:</strong> RM ${formatMoney(data.roadtax)}</span>` : ''}
<span style="display:block"><strong>Total Paid:</strong> RM ${formatMoney(data.total)}</span>

✅ Your policy documents have been sent to your **WhatsApp** and **email**.

📄 **Download your documents:**
- <a href="/documents/cover-note-${data.paymentId}.pdf" target="_blank" rel="noopener noreferrer" download><strong>Insurance Cover Note (PDF)</strong></a>
- <a href="/documents/policy-${data.paymentId}.pdf" target="_blank" rel="noopener noreferrer" download><strong>Insurance Policy (PDF)</strong></a>
- <a href="/documents/roadtax-${data.paymentId}.pdf" target="_blank" rel="noopener noreferrer" download><strong>Road Tax Receipt (PDF)</strong></a>

Your coverage starts immediately. Drive safe!`
      };

      setMessages(prev => {
        const alreadyShown = prev.some(
          (msg) => msg.role === "assistant" && msg.content.includes(`<strong>Reference:</strong> ${data.paymentId}`)
        );
        return alreadyShown ? prev : [...prev, successMessage];
      });

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

    const consumePaymentSuccess = (raw) => {
      if (!raw) return false;
      try {
        const paymentData = JSON.parse(raw);
        if (paymentData?.type === "PAYMENT_SUCCESS" && paymentData?.data) {
          showPaymentSuccess(paymentData.data);
          return true;
        }
      } catch (e) {
        console.error("Error parsing payment success data:", e);
      }
      return false;
    };

    const processStoredPaymentSuccess = () => {
      const stored = localStorage.getItem("lajoo_payment_success");
      if (!stored) return;
      consumePaymentSuccess(stored);
      localStorage.removeItem("lajoo_payment_success");
    };

    // Listen for localStorage changes (from payment tab)
    const handleStorageChange = (event) => {
      if (event.key === 'lajoo_payment_success' && event.newValue) {
        consumePaymentSuccess(event.newValue);
        localStorage.removeItem("lajoo_payment_success");
      }
    };

    // Also check on focus (in case the user returns later).
    const handleFocus = () => {
      processStoredPaymentSuccess();
    };

    // Catch success key on initial mount as well.
    processStoredPaymentSuccess();

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
      let sseBuffer = "";
      let shouldStopStream = false;

      const handleSseEvent = (eventText) => {
        if (!eventText || !eventText.startsWith("data:")) return;
        const payload = eventText.slice(5).trim();
        if (!payload || payload === "[DONE]") return;

        let data = null;
        try {
          data = JSON.parse(payload);
        } catch {
          // Ignore malformed payloads instead of crashing the chat stream.
          return;
        }

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
          shouldStopStream = true;
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
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;

        sseBuffer += decoder.decode(value, { stream: true });
        const completeEvents = sseBuffer.split("\n\n");
        sseBuffer = completeEvents.pop() || "";
        completeEvents.filter(Boolean).forEach(handleSseEvent);
        if (shouldStopStream) break;
      }

      // Flush any decoder remainder and process any final complete SSE event.
      if (!shouldStopStream) {
        sseBuffer += decoder.decode();
        const finalEvents = sseBuffer.split("\n\n").filter(Boolean);
        finalEvents.forEach(handleSseEvent);
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
      requestAnimationFrame(() => {
        // Final alignment pass once the stream is complete.
        if (pendingScrollRef.current) {
          executeScrollToUserMessage(pendingScrollRef.current);
        }
        // Release lock but keep computed spacer so the anchored turn doesn't drop back down.
        stopTurnAnchoring(false);
      });
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
    keepTurnAnchoredRef.current = true;
    setIsTurnAnchoring(true);
    anchorSpacerPxRef.current = 0;
    setAnchorSpacerPx(0);
    anchorStableCountRef.current = 0;
    anchorHoldUntilRef.current = Date.now() + 280;

    setMessages([...history, { id: assistantId, role: "assistant", content: "" }]);
    setInputText("");
    // Reset textarea height
    if (inputRef.current) inputRef.current.style.height = 'auto';
    streamReply(history, assistantId);
  };

  useEffect(() => {
    if (!hasMessages) {
      resetHomePosition();
    }
  }, [hasMessages, resetHomePosition]);

  useEffect(() => {
    const bodyClass = "home-route";
    document.body.classList.add(bodyClass);
    return () => {
      document.body.classList.remove(bodyClass);
    };
  }, []);

  useEffect(() => {
    if (!isAddMenuOpen) return;

    const handleOutsidePress = (event) => {
      const target = event.target;
      if (addMenuRef.current?.contains(target) || addButtonRef.current?.contains(target)) {
        return;
      }
      setIsAddMenuOpen(false);
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setIsAddMenuOpen(false);
      }
    };

    window.addEventListener("pointerdown", handleOutsidePress);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("pointerdown", handleOutsidePress);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isAddMenuOpen]);

  return (
    <>
      <Head>
        <title>Renew Insurance In Minutes With LAJOO</title>
      </Head>
      <div className={`home-page-shell ${hasMessages ? "is-chatting" : "is-home"}`}>
        <main ref={homeMainRef} className={`hero home-main ${hasMessages ? "hero-chatting" : ""}`}>
          {!hasMessages && (
            <div className="hero-content home-hero">
              <EqualWidthTitle
                className="home-hero-title"
                lineClassName="home-hero-title-line"
                secondaryLineClassName="home-hero-title-line-second"
                primaryText="Renew insurance"
                secondaryText="in one simple chat with AI."
              />

              <div className="home-hero-types" role="group" aria-label="Insurance type">
                <div className="home-hero-type-option">
                  <HeroTypeIcon
                    src="/icons/car-insurance.png"
                    alt="Car insurance icon"
                    fallback="🚗"
                  />
                  <button
                    type="button"
                    className="home-hero-type-chip"
                    onClick={() => handleQuickStart("Renew car insurance")}
                  >
                    Car Insurance
                  </button>
                </div>

                <div className="home-hero-type-option">
                  <HeroTypeIcon
                    src="/icons/motor-insurance.png"
                    alt="Motor insurance icon"
                    fallback="🛵"
                  />
                  <button
                    type="button"
                    className="home-hero-type-chip"
                    onClick={() => handleQuickStart("Renew motor insurance")}
                  >
                    Motor Insurance
                  </button>
                </div>
              </div>

              <div className="home-hero-insurers" aria-label="Trusted insurers">
                <div
                  className={`home-hero-insurers-track${heroInsurerLoopWidth ? " is-ready" : ""}`}
                  style={
                    heroInsurerLoopWidth
                      ? { "--home-hero-insurers-loop-width": `${heroInsurerLoopWidth}px` }
                      : undefined
                  }
                >
                  {Array.from({ length: 3 }).map((_, groupIdx) => (
                    <div
                      key={`insurer-group-${groupIdx}`}
                      className="home-hero-insurers-group"
                      aria-hidden={groupIdx > 0}
                      ref={groupIdx === 0 ? heroInsurerGroupRef : undefined}
                    >
                      {HERO_INSURER_LOGOS.map((insurer) => (
                        <span
                          key={`${groupIdx}-${insurer.id}`}
                          className="home-hero-insurer-logo-wrap"
                          data-insurer={insurer.id}
                        >
                          <Image
                            src={insurer.src}
                            alt={insurer.name}
                            width={132}
                            height={42}
                            className="home-hero-insurer-logo"
                          />
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {hasMessages && (
            <div
              className="chat-container"
              ref={threadRef}
              onScroll={handleScroll}
            >
              <div className={`chat-feed ${isTurnAnchoring ? "chat-feed-anchor-turn" : ""}`}>
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
                            a: ({ href, children, node, ...anchorProps }) => {
                              const isMailtoLink = typeof href === "string" && /^mailto:/i.test(href);
                              if (isMailtoLink) {
                                return <span className={anchorProps.className}>{children}</span>;
                              }
                              // Open payment links in new tab
                              const isPaymentLink = href && href.includes('/payment/');
                              const isDocumentPdfLink = typeof href === "string" && /\/documents\/.+\.pdf(?:\?.*)?$/i.test(href);
                              const shouldOpenNewTab = isPaymentLink || isDocumentPdfLink || anchorProps.target === "_blank";
                              const shouldDownload = isDocumentPdfLink || anchorProps.download !== undefined;
                              const hrefWithSession =
                                isPaymentLink && href && !/[?&]session=/.test(href)
                                  ? `${href}${href.includes("?") ? "&" : "?"}session=${encodeURIComponent(sessionKey)}`
                                  : href;
                              const paymentButtonStyle = isPaymentLink
                                ? {
                                    display: "inline-block",
                                    background: "#00B14F",
                                    color: "#ffffff",
                                    textDecoration: "none",
                                    padding: "10px 18px",
                                    borderRadius: "999px",
                                    fontSize: "1.05em",
                                    fontWeight: 700,
                                    lineHeight: 1.2,
                                  }
                                : undefined;
                              const mergedClassName = [
                                anchorProps.className,
                                isPaymentLink ? "payment-cta" : null,
                              ].filter(Boolean).join(" ");
                              return (
                                <a
                                  {...anchorProps}
                                  className={mergedClassName || undefined}
                                  href={hrefWithSession}
                                  target={shouldOpenNewTab ? "_blank" : (anchorProps.target || "_self")}
                                  rel={shouldOpenNewTab ? (anchorProps.rel || "noopener noreferrer") : anchorProps.rel}
                                  download={shouldDownload ? (typeof anchorProps.download === "string" ? anchorProps.download : "") : undefined}
                                  style={paymentButtonStyle || anchorProps.style}
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

                {anchorSpacerPx > 0 && (
                  <div
                    className="chat-anchor-spacer"
                    style={{ height: `${anchorSpacerPx}px` }}
                    aria-hidden
                  />
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
                <div className="add-button-slot">
                  <button
                    ref={addButtonRef}
                    className="add-button"
                    aria-label="Add attachments"
                    aria-haspopup="menu"
                    aria-controls="chat-add-menu"
                    aria-expanded={isAddMenuOpen}
                    onClick={() => setIsAddMenuOpen((open) => !open)}
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>

                  {isAddMenuOpen && (
                    <div id="chat-add-menu" className="chat-add-menu" role="menu" ref={addMenuRef}>
                      <button type="button" className="chat-add-menu-item" role="menuitem" onClick={() => triggerAttachmentPicker("camera")}>
                        <svg className="chat-add-menu-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M4 8.5h16a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-7.5a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.9" />
                          <path d="M8.2 8.5 9.5 6h5l1.3 2.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                          <circle cx="12" cy="14.2" r="3.3" stroke="currentColor" strokeWidth="1.9" />
                        </svg>
                        <span>Take photo</span>
                      </button>

                      <button type="button" className="chat-add-menu-item" role="menuitem" onClick={() => triggerAttachmentPicker("photos")}>
                        <svg className="chat-add-menu-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M7.5 11.5V8.8a4.5 4.5 0 0 1 9 0v6.7a5.5 5.5 0 1 1-11 0V7.8a3.5 3.5 0 0 1 7 0v7" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                        </svg>
                        <span>Add photos</span>
                      </button>

                      <hr className="chat-add-menu-divider" />

                      <button type="button" className="chat-add-menu-item" role="menuitem" onClick={() => triggerAttachmentPicker("pdf")}>
                        <svg className="chat-add-menu-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
                          <path d="M14 3v5h5" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
                          <path d="M8.7 16.2h2.4M8.7 18.4h5.4M8.7 14h6.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                        </svg>
                        <span>Attach PDF</span>
                      </button>
                    </div>
                  )}

                  <input
                    ref={takePhotoInputRef}
                    className="chat-hidden-input"
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleAttachmentSelection}
                  />
                  <input
                    ref={addPhotosInputRef}
                    className="chat-hidden-input"
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleAttachmentSelection}
                  />
                  <input
                    ref={attachPdfInputRef}
                    className="chat-hidden-input"
                    type="file"
                    accept="application/pdf"
                    onChange={handleAttachmentSelection}
                  />
                </div>

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
                  onBlur={() => {
                    if (!hasMessages) {
                      setTimeout(() => {
                        resetHomePosition();
                      }, 80);
                    }
                  }}
                  rows={1}
                />

                <button
                  type="button"
                  className="send-button"
                  onClick={handleSend}
                  disabled={!inputText.trim() || isStreaming}
                  aria-label="Send message"
                >
                  <svg className="send-icon" width="24" height="24" viewBox="0 0 24 24" fill="none">
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
      </div>
    </>
  );
}
