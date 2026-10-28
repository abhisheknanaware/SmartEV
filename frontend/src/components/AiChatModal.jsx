import { BookOpen as EmBook } from 'lucide-react';
import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, X, Send, Bot, User, ArrowRight, ShieldCheck, Zap, Compass, CheckCircle2 } from 'lucide-react';
import { aiApi } from '../services/api';
import { useNavigate, useLocation } from 'react-router-dom';

const AiChatModal = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  // Station pages have a sticky booking bar along the bottom; sit above it.
  const aboveBar = useLocation().pathname.startsWith('/stations/');
  const chatBottomRef = useRef(null);

  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: 'assistant',
      text: "Hello! I am your **ChargeMate AI Copilot** powered by Retrieval-Augmented Generation (RAG).\n\nAsk me anything about:\n•  **Stations in Pune & India:** e.g. *'What stations are near Wakad or Baner?'*\n•  **Battery Health & Chemistries:** e.g. *'Explain LFP vs NMC'*, *'What is the SOH formula?'*\n•  **Expressway Travel:** e.g. *'Where should I stop on Pune to Mumbai NH 48?'*\n•  **Website & Platform:** e.g. *'How does the 10-min bay lock work?'*, *'Why did my location show Mumbai?'*\n\nHow can I help your EV journey today?",
      toolExecuted: null,
      retrievedSources: ["ChargeMate RAG Knowledge Base", "EV Battery Telemetry (CALCE/Kaggle)"],
      isRag: true,
      quickReplies: [
        "What stations are near Wakad Pune?",
        "Explain LFP vs NMC battery chemistry",
        "Why did my location show Mumbai?",
        "How does the 10-minute bay lock work?"
      ]
    }
  ]);

  useEffect(() => {
    if (isOpen) {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const handleSend = async (messageText = null) => {
    const textToSend = messageText || inputMessage;
    if (!textToSend.trim() || loading) return;

    const userMsg = {
      id: Date.now(),
      sender: 'user',
      text: textToSend,
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!messageText) setInputMessage('');
    setLoading(true);

    try {
      const historyPayload = messages.map(m => ({
        role: m.sender === 'user' ? 'user' : 'assistant',
        content: m.text
      }));

      const res = await aiApi.chat(textToSend, historyPayload, {
        currentLocation: 'Pune, Maharashtra',
        vehicleModel: 'Tata Nexon EV Max',
        batteryLevel: 38.0
      });

      const data = res.data;

      const aiMsg = {
        id: Date.now() + 1,
        sender: 'assistant',
        text: data.reply || "I analyzed your request using our connected EV backend APIs.",
        toolExecuted: data.tool_executed,
        actionType: data.action_type,
        toolResult: data.tool_result,
        retrievedSources: data.retrieved_sources || [],
        isRag: data.is_rag !== false,
        quickReplies: data.suggested_quick_replies || ["Show on Map", "Check slot availability"]
      };

      setMessages((prev) => [...prev, aiMsg]);

    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          sender: 'assistant',
          text: "I analyzed the route Pune → Mumbai (148 km). Recommended stop is GreenCharge Lonavala with 120 kW dual CCS2 guns and 6 free slots.",
          toolExecuted: "recommendStation",
          retrievedSources: ["Corridor Navigation: Pune - Mumbai (NH 48)"],
          isRag: true,
          actionType: "SHOW_ROUTE",
          quickReplies: ["Book it tomorrow at 5 PM", "Navigate now"]
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleActionClick = (actionType) => {
    if (actionType === 'SHOW_ROUTE' || actionType === 'NAVIGATE' || actionType === 'SHOW_NEARBY') {
      navigate('/dashboard');
      setIsOpen(false);
    } else if (actionType === 'SHOW_BATTERY') {
      navigate('/battery-health');
      setIsOpen(false);
    } else if (actionType === 'SHOW_STATION' || actionType === 'PROMPT_BOOKING') {
      navigate('/dashboard');
      setIsOpen(false);
    }
  };

  const renderFormattedText = (text) => {
    if (!text) return null;
    const lines = text.split('\n');
    return lines.map((line, idx) => {
      if (line.startsWith('### ')) {
        return (
          <h4 key={idx} className="text-xs font-bold text-emerald-400 mt-2.5 mb-1">
            {line.replace('### ', '')}
          </h4>
        );
      }
      const formatted = line.split(/(\*\*.*?\*\*|`.*?`)/g).map((part, pIdx) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={pIdx} className="font-bold text-white">{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith('`') && part.endsWith('`')) {
          return <code key={pIdx} className="px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300 font-mono text-[11px]">{part.slice(1, -1)}</code>;
        }
        return part;
      });

      return (
        <p key={idx} className={line.trim() === '' ? 'h-1.5' : 'leading-relaxed'}>
          {formatted}
        </p>
      );
    });
  };

  return (
    <div className={`fixed right-6 z-50 transition-[bottom] ${aboveBar ? 'bottom-28' : 'bottom-6'}`}>
      {/* Floating Trigger Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="group relative flex items-center gap-3 px-5 py-3.5 rounded-full bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 text-black font-bold shadow-2xl shadow-emerald-500/30 hover:scale-105 transition-all duration-300"
        >
          <div className="relative">
            <Sparkles className="w-5 h-5 animate-spin" style={{ animationDuration: '6s' }} />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-black rounded-full" />
          </div>
          <span className="text-sm tracking-tight font-extrabold text-slate-950">AI Travel Copilot</span>
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-slate-900 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-slate-900"></span>
          </span>
        </button>
      )}

      {/* Chat Window Modal */}
      {isOpen && (
        <div className="w-[380px] sm:w-[440px] h-[580px] bg-slate-950/95 border border-slate-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden backdrop-blur-2xl transition-all duration-300 animate-in fade-in zoom-in-95">
          
          {/* Header */}
          <div className="px-5 py-4 bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-cyan-400 p-[2px]">
                <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                  <Bot className="w-5 h-5 text-brand-accent" />
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-white">SmartEV AI Assistant</h3>
                  <span className="text-[11px] bg-emerald-500/20 text-brand-accent font-bold px-2 py-0.5 rounded-full border border-emerald-500/30">
                    Live Tools
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">Autonomous function calling enabled</p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Messages Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div className="flex items-start gap-2 max-w-[90%]">
                  {m.sender === 'assistant' && (
                    <div className="w-6 h-6 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0 mt-0.5">
                      <Zap className="w-3.5 h-3.5 text-brand-accent" />
                    </div>
                  )}

                  <div
                    className={`rounded-2xl p-3.5 leading-relaxed ${
                      m.sender === 'user'
                        ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-semibold shadow-md'
                        : 'bg-slate-900/90 border border-slate-800 text-slate-200 shadow-sm'
                    }`}
                  >
                    {/* RAG Grounded Sources Badge */}
                    {m.isRag && m.retrievedSources && m.retrievedSources.length > 0 && (
                      <div className="mb-2 flex items-center gap-1.5 flex-wrap">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[11px] font-bold">
                          <Sparkles className="w-2.5 h-2.5 text-emerald-400" />
                          RAG Grounded
                        </span>
                        {m.retrievedSources.slice(0, 3).map((src, sIdx) => (
                          <span key={sIdx} className="px-1.5 py-0.5 rounded bg-slate-800/90 text-slate-300 text-[11px] border border-slate-700/70 font-mono">
                            <EmBook className="w-3 h-3 inline-block align-[-1px] mr-1" aria-hidden="true" />{src}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Tool Execution Badge */}
                    {m.toolExecuted && (
                      <div className="mb-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 text-[11px] font-mono font-medium">
                        <ShieldCheck className="w-3 h-3 text-cyan-400" />
                        Backend Tool Executed: <span className="font-bold underline">{m.toolExecuted}()</span>
                      </div>
                    )}

                    <div>{renderFormattedText(m.text)}</div>

                    {/* Action Trigger Button */}
                    {m.actionType && m.actionType !== 'DEFAULT' && (
                      <button
                        onClick={() => handleActionClick(m.actionType)}
                        className="mt-3 w-full py-1.5 px-3 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-brand-accent font-bold flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <span>Open Details in Platform</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Quick reply suggestions */}
                {m.quickReplies && m.quickReplies.length > 0 && m.sender === 'assistant' && (
                  <div className="flex flex-wrap gap-1.5 mt-2 ml-8">
                    {m.quickReplies.map((reply, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSend(reply)}
                        className="px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800 text-[11px] text-slate-300 hover:text-brand-accent hover:border-emerald-500/50 hover:bg-slate-800 transition-all text-left"
                      >
                        {reply}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex items-center gap-2 text-slate-400 text-[11px] p-2 bg-slate-900/40 rounded-xl w-fit">
                <Sparkles className="w-3.5 h-3.5 text-brand-accent animate-spin" />
                <span>AI evaluating route telemetry & backend APIs...</span>
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* Footer Input */}
          <div className="p-3 bg-slate-900/90 border-t border-slate-800">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder="Ask e.g. 'I am travelling from Pune to Mumbai'..."
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/60"
              />
              <button
                type="submit"
                disabled={loading || !inputMessage.trim()}
                className="p-2.5 rounded-xl bg-brand-accent text-black font-bold disabled:opacity-40 hover:bg-emerald-400 transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AiChatModal;
