import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { 
  Send, 
  LogOut, 
  User, 
  Bot, 
  Calendar, 
  Clock, 
  Stethoscope,
  AlertCircle,
  MessageCircle
} from "lucide-react";
import { Session } from "@supabase/supabase-js";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  intent?: string;
  created_at: string;
}

const Chat = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (!session) {
        navigate("/auth");
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (!session) {
        navigate("/auth");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (session?.user) {
      loadOrCreateConversation();
    }
  }, [session]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadOrCreateConversation = async () => {
    if (!session?.user) return;

    try {
      const { data: conversations } = await supabase
        .from("conversations")
        .select("*")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false })
        .limit(1);

      if (conversations && conversations.length > 0) {
        setConversationId(conversations[0].id);
        await loadMessages(conversations[0].id);
      } else {
        const { data: newConv } = await supabase
          .from("conversations")
          .insert({ user_id: session.user.id, title: "New Conversation" })
          .select()
          .single();

        if (newConv) {
          setConversationId(newConv.id);
          await addWelcomeMessage(newConv.id);
        }
      }
    } catch (error: any) {
      console.error("Error loading conversation:", error);
    }
  };

  const loadMessages = async (convId: string) => {
    try {
      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", convId)
        .order("created_at", { ascending: true });

      if (data) {
        setMessages(data as Message[]);
      }
    } catch (error: any) {
      console.error("Error loading messages:", error);
    }
  };

  const addWelcomeMessage = async (convId: string) => {
    const welcomeMsg = {
      conversation_id: convId,
      role: "assistant",
      content: "Hello! I'm your HospitalCare assistant. How can I help you today?",
      intent: "greeting",
    };

    const { data } = await supabase
      .from("messages")
      .insert(welcomeMsg)
      .select()
      .single();

    if (data) {
      setMessages([data as Message]);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || !conversationId || !session?.user) return;

    const userMessage = input.trim();
    setInput("");
    setLoading(true);

    // Add user message to UI immediately
    const tempUserMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: userMessage,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      // Save user message to database
      await supabase.from("messages").insert({
        conversation_id: conversationId,
        role: "user",
        content: userMessage,
      });

      // Get intent and response from edge function
      const { data, error } = await supabase.functions.invoke("chat-intent", {
        body: { message: userMessage, userId: session.user.id },
      });

      if (error) throw error;

      // Add assistant response
      const assistantMsg = {
        conversation_id: conversationId,
        role: "assistant",
        content: data.response,
        intent: data.intent,
      };

      const { data: savedMsg } = await supabase
        .from("messages")
        .insert(assistantMsg)
        .select()
        .single();

      if (savedMsg) {
        setMessages((prev) => [...prev, savedMsg as Message]);
      }
    } catch (error: any) {
      console.error("Error sending message:", error);
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const quickReplies = [
    { icon: Calendar, text: "Book Appointment", color: "primary" },
    { icon: Clock, text: "Visiting Hours", color: "accent" },
    { icon: Stethoscope, text: "Find Doctor", color: "primary" },
    { icon: AlertCircle, text: "Emergency", color: "destructive" },
  ];

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5">
      {/* Header */}
      <header className="bg-card border-b shadow-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Stethoscope className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold">HospitalCare</h1>
              <p className="text-xs text-muted-foreground">AI Health Assistant</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-2">
            <LogOut className="w-4 h-4" />
            Logout
          </Button>
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto p-4">
        <div className="container mx-auto max-w-4xl space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {message.role === "assistant" && (
                <Avatar className="w-8 h-8 bg-gradient-to-br from-primary to-accent">
                  <AvatarFallback>
                    <Bot className="w-5 h-5 text-primary-foreground" />
                  </AvatarFallback>
                </Avatar>
              )}
              <Card
                className={`px-4 py-3 max-w-[80%] ${
                  message.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-card"
                }`}
              >
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
              </Card>
              {message.role === "user" && (
                <Avatar className="w-8 h-8 bg-secondary">
                  <AvatarFallback>
                    <User className="w-5 h-5 text-secondary-foreground" />
                  </AvatarFallback>
                </Avatar>
              )}
            </div>
          ))}
          {loading && (
            <div className="flex gap-3 justify-start">
              <Avatar className="w-8 h-8 bg-gradient-to-br from-primary to-accent">
                <AvatarFallback>
                  <Bot className="w-5 h-5 text-primary-foreground" />
                </AvatarFallback>
              </Avatar>
              <Card className="px-4 py-3">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                  <div className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                  <div className="w-2 h-2 bg-primary rounded-full animate-bounce"></div>
                </div>
              </Card>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Quick Replies */}
      {messages.length === 1 && (
        <div className="px-4 pb-2">
          <div className="container mx-auto max-w-4xl">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {quickReplies.map((reply, idx) => (
                <Button
                  key={idx}
                  variant="outline"
                  size="sm"
                  onClick={() => setInput(reply.text)}
                  className="gap-2 justify-start"
                >
                  <reply.icon className="w-4 h-4" />
                  {reply.text}
                </Button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Input */}
      <footer className="bg-card border-t p-4">
        <div className="container mx-auto max-w-4xl">
          <div className="flex gap-2">
            <Input
              placeholder="Type your message..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
              disabled={loading}
              className="flex-1"
            />
            <Button onClick={handleSend} disabled={loading || !input.trim()}>
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Chat;
