import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Intent detection patterns
const intentPatterns = {
  greeting: /\b(hi|hello|hey|good morning|good afternoon|good evening)\b/i,
  book_appointment: /\b(book|schedule|appointment|visit|reserve|slot|make)\b.*\b(appointment|doctor|visit)\b/i,
  doctor_search: /\b(find|search|show|list|which|doctors?|cardiologist|orthopedist|pediatrician|neurologist|surgeon|specialist)\b/i,
  faq_hours: /\b(visiting hours?|opening hours?|timings?|open|close|when|hours)\b/i,
  symptom_triage: /\b(chest pain|sweating|dizzy|faint|fever|swollen|bleeding|cough|blood|breath|abdominal pain|symptom)\b/i,
  cancel_appointment: /\b(cancel|remove)\b.*\b(appointment|booking)\b/i,
  emergency: /\b(emergency|urgent|911|ambulance|critical)\b/i,
};

// Emergency symptoms that require immediate attention
const emergencySymptoms = [
  "chest pain", "difficulty breathing", "shortness of breath", "coughing blood",
  "severe bleeding", "severe abdominal pain", "unconscious", "stroke", "heart attack"
];

const detectIntent = (message: string): string => {
  const lowerMessage = message.toLowerCase();
  
  // Check for emergency first
  if (emergencySymptoms.some(symptom => lowerMessage.includes(symptom)) || 
      intentPatterns.emergency.test(lowerMessage)) {
    return "emergency";
  }
  
  if (intentPatterns.greeting.test(lowerMessage)) return "greeting";
  if (intentPatterns.book_appointment.test(lowerMessage)) return "book_appointment";
  if (intentPatterns.doctor_search.test(lowerMessage)) return "doctor_search";
  if (intentPatterns.faq_hours.test(lowerMessage)) return "faq_hours";
  if (intentPatterns.symptom_triage.test(lowerMessage)) return "symptom_triage";
  if (intentPatterns.cancel_appointment.test(lowerMessage)) return "cancel_appointment";
  
  return "fallback";
};

const generateResponse = async (intent: string, message: string, supabaseClient: any): Promise<string> => {
  switch (intent) {
    case "greeting":
      return "Hello! I'm your HospitalCare assistant. I can help you with:\n\n" +
             "• Booking appointments with doctors\n" +
             "• Finding specialists by specialty\n" +
             "• Visiting hours and hospital information\n" +
             "• Basic health questions\n\n" +
             "How can I assist you today?";

    case "book_appointment":
      // Get doctors list
      const { data: doctors } = await supabaseClient
        .from("doctors")
        .select("*")
        .order("name");
      
      if (!doctors || doctors.length === 0) {
        return "I can help you book an appointment. However, there are no doctors available at the moment. Please try again later.";
      }
      
      let response = "I can help you book an appointment! Here are our available doctors:\n\n";
      doctors.forEach((doc: any, idx: number) => {
        response += `${idx + 1}. Dr. ${doc.name} - ${doc.specialty}\n`;
        response += `   Available: ${doc.days.join(", ")}\n`;
        response += `   Hours: ${doc.start_hour}:00 - ${doc.end_hour}:00\n\n`;
      });
      response += "Please specify which doctor you'd like to see, or let me know your preferred specialty and I'll help you find the right doctor.";
      return response;

    case "doctor_search":
      const lowerMsg = message.toLowerCase();
      let specialty = "";
      
      if (lowerMsg.includes("cardio")) specialty = "Cardiology";
      else if (lowerMsg.includes("ortho")) specialty = "Orthopedics";
      else if (lowerMsg.includes("pediat")) specialty = "Pediatrics";
      else if (lowerMsg.includes("neuro")) specialty = "Neurology";
      else if (lowerMsg.includes("general")) specialty = "General Medicine";
      
      let query = supabaseClient.from("doctors").select("*");
      if (specialty) {
        query = query.ilike("specialty", `%${specialty}%`);
      }
      
      const { data: searchDoctors } = await query;
      
      if (!searchDoctors || searchDoctors.length === 0) {
        return "I couldn't find any doctors matching your criteria. Could you please specify the specialty you're looking for? " +
               "We have specialists in Cardiology, Orthopedics, Pediatrics, Neurology, and General Medicine.";
      }
      
      let searchResponse = specialty 
        ? `Here are our ${specialty} specialists:\n\n`
        : "Here are our available doctors:\n\n";
        
      searchDoctors.forEach((doc: any) => {
        searchResponse += `• Dr. ${doc.name} - ${doc.specialty}\n`;
        searchResponse += `  Available: ${doc.days.join(", ")}\n`;
        searchResponse += `  Hours: ${doc.start_hour}:00 - ${doc.end_hour}:00\n\n`;
      });
      searchResponse += "Would you like to book an appointment with any of these doctors?";
      return searchResponse;

    case "faq_hours":
      return "🏥 **Hospital Visiting Hours**\n\n" +
             "• General Visiting: 10:00 AM - 8:00 PM\n" +
             "• ICU Visiting: 4:00 PM - 5:00 PM\n" +
             "• Emergency: Open 24/7\n\n" +
             "**Clinic Hours by Department:**\n" +
             "• Outpatient Clinics: Monday-Saturday, 8:00 AM - 8:00 PM\n" +
             "• Diagnostic Services: Monday-Saturday, 7:00 AM - 9:00 PM\n" +
             "• Pharmacy: Open 24/7\n\n" +
             "Is there anything specific you'd like to know?";

    case "symptom_triage":
      const emergencyCheck = emergencySymptoms.some(symptom => 
        message.toLowerCase().includes(symptom)
      );
      
      if (emergencyCheck) {
        return "⚠️ **EMERGENCY ALERT** ⚠️\n\n" +
               "Based on your symptoms, you need immediate medical attention!\n\n" +
               "**Call Emergency Services (911) immediately** or go to the nearest Emergency Room.\n\n" +
               "🚨 Emergency Contact: 911\n" +
               "🏥 Hospital Emergency: +1-555-HOSPITAL\n\n" +
               "Do not wait - seek help now!";
      }
      
      return "I understand you're experiencing symptoms. While I can provide general information, " +
             "I'm not qualified to diagnose medical conditions.\n\n" +
             "**For proper medical advice:**\n" +
             "• If symptoms are severe or worsening → Call 911 or visit Emergency\n" +
             "• For non-urgent concerns → I can help you book an appointment with a doctor\n" +
             "• For general health questions → I'm here to help with information\n\n" +
             "Would you like me to help you book an appointment with a doctor?";

    case "cancel_appointment":
      return "I can help you cancel your appointment. To proceed, please provide:\n\n" +
             "• Your appointment reference ID, or\n" +
             "• The date and doctor name of your appointment\n\n" +
             "Note: You can also view and manage your appointments through your patient portal.";

    case "emergency":
      return "🚨 **EMERGENCY RESPONSE** 🚨\n\n" +
             "If this is a life-threatening emergency:\n\n" +
             "**CALL 911 IMMEDIATELY**\n\n" +
             "🏥 Hospital Emergency Room: Open 24/7\n" +
             "📞 Emergency Hotline: +1-555-HOSPITAL\n" +
             "📍 Address: 123 Medical Center Drive\n\n" +
             "For urgent but non-life-threatening issues, our emergency department is always open. " +
             "Do not wait if you believe your condition is serious!";

    default:
      return "I'm not sure I understand. I can help you with:\n\n" +
             "• **Book an appointment** - Schedule a visit with our doctors\n" +
             "• **Find a doctor** - Search by specialty\n" +
             "• **Visiting hours** - Get hospital timing information\n" +
             "• **Health questions** - General medical information\n" +
             "• **Emergency help** - Urgent medical assistance\n\n" +
             "What would you like help with?";
  }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, userId } = await req.json();
    
    if (!message) {
      return new Response(
        JSON.stringify({ error: "Message is required" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Detect intent
    const intent = detectIntent(message);
    console.log(`Detected intent: ${intent} for message: ${message}`);

    // Generate response
    const response = await generateResponse(intent, message, supabaseClient);

    return new Response(
      JSON.stringify({ intent, response }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error in chat-intent function:', error);
    return new Response(
      JSON.stringify({ 
        error: error?.message || "An unexpected error occurred",
        intent: "error",
        response: "I'm sorry, I encountered an error processing your request. Please try again."
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
