import { GoogleGenAI, Modality } from "@google/genai";
import { WebSocketServer } from "ws";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
      console.error("ERROR: GEMINI_API_KEY is not set. Please set it in .env file.");
      process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const MODEL = "gemini-2.5-flash-native-audio-preview-12-2025";
const LIVE_CONFIG = {
      responseModalities: ["AUDIO"],
      systemInstruction: `
      You are the AI extraction engine for MIST (Multimodal Incident Streaming Technology), operating in a highly chaotic, high-noise prehospital Emergency Medical Services (EMS) environment.

      YOUR OBJECTIVE:
      Passively analyze overlapping ambient audio from an EMS scene. When you detect a discrete medical event, immediately extract it, map it to standardized global health frameworks, and output a strict JSON payload.

      CLINICAL FRAMEWORK (ATMIST):
      Categorize all extracted data into the ATMIST mnemonic domains:
      - [A] Age and Demographics
      - [T] Time (Temporal data for interventions or onset)
      - [M] Mechanism of Injury or Medical Complaint
      - [I] Injuries or Inspections (Physical findings)
      - [S] Signs and Vital Signs (HR, RR, BP, SpO2, GCS)
      - [T] Treatments (Medications, Airway management, CPR)

      INTEROPERABILITY & LOCALIZATION (NEMSIS & Thai CBD):
      1. NEMSIS v3.5.0: You must tag every extraction with its corresponding NEMSIS element (e.g., eMedications.03, eVitals.10, eSituation.09).
      2. Thai NIEM CBD Protocol: When extracting a Chief Complaint/Mechanism, map the unstructured dialogue to one of the 25 official Criteria Based Dispatch (CBD) categories (e.g., Category 7 for Chest Pain, Category 25 for MVA).
      3. Triage Classification: Assign an admission/rescue probability triage color based on the CBD protocol: Red (Critical), Yellow (Urgent), Green (Semi-urgent), White (Non-urgent), or Black (Deceased).

      REGULATORY COMPLIANCE (SaMD & Patient Safety):
      1. ZERO HALLUCINATION: You operate in a life-or-death clinical environment. Do NOT fabricate, guess, or predict medications, dosages, or vital signs. If an entity is obscured by acoustic noise, omit it entirely. Restrict output to explicitly stated data.
      2. HUMAN-IN-THE-LOOP: You are a Clinical Decision Support Software (CDSS) acting to "Inform" clinical management. You do not act autonomously. Every output must flag that it requires human verification.
      3. ACOUSTIC PROVENANCE: You must include the exact verbatim quote you transcribed from the audio to provide a clinical audit trail.

      OUTPUT FORMAT:
      Output ONLY a valid, single JSON object representing the atomic event. Do not use markdown blocks (\`\`\`json). Do not include conversational filler.

      {
            "atmist_domain": "A|T|M|I|S|T",
            "nemsis_mapping": "e.g., eVitals.10",
            "thai_cbd": {
            "category_code": 1_to_25_or_null,
            "triage_color": "Red|Yellow|Green|White|Black|null"
      },
            "extracted_clinical_data": {
            "parameter": "String (e.g., Heart Rate, Aspirin, Laceration)",
            "value": "Number or String",
            "unit": "String or null"
      },
            "provenance": {
            "raw_transcript": "Exact verbatim audio quote"
      },
            "samd_compliance": {
            "requires_human_verification": true,
            "confidence_score": 0.0_to_1.0
      }
}

      Await audio stream.
`};

const PORT = process.env.PORT || 8080;

const rooms = new Map();

function joinRoom(roomId, ws) {
      if (!rooms.has(roomId)) {
            rooms.set(roomId, new Set());
      }
      rooms.get(roomId).add(ws);
      console.log(`[Room ${roomId}] Client joined (${rooms.get(roomId).size} clients)`);
}

function leaveRoom(roomId, ws) {
      const room = rooms.get(roomId);
      if (!room) return;
      room.delete(ws);
      console.log(`[Room ${roomId}] Client left (${room.size} clients)`);
      if (room.size === 0) {
            rooms.delete(roomId);
            console.log(`[Room ${roomId}] Room removed (empty)`);
      }
}

function getRoomClients(roomId) {
      return rooms.get(roomId) || new Set();
}

async function main() {
      const wss = new WebSocketServer({ port: PORT });
      console.log(`WebSocket server running on port ${PORT}`);

      wss.on("connection", async (ws, req) => {
            const url = new URL(req.url, `http://localhost:${PORT}`);
            const roomId = url.searchParams.get("room") || "default";

            console.log(`Client connected → room: ${roomId}`);
            joinRoom(roomId, ws);

            ws.send(JSON.stringify({
                  type: "room_info",
                  roomId,
                  clients: getRoomClients(roomId).size,
            }));

            let geminiSession = null;

            try {
                  geminiSession = await ai.live.connect({
                        model: MODEL,
                        config: LIVE_CONFIG,
                        callbacks: {
                              onopen: () => {
                                    console.log(`[Room ${roomId}] Connected to Gemini Live API`);
                                    ws.send(JSON.stringify({ type: "status", status: "connected" }));
                              },
                              onmessage: (message) => {
                                    if (message.serverContent && message.serverContent.interrupted) {
                                          ws.send(JSON.stringify({ type: "interrupted" }));
                                          return;
                                    }

                                    if (
                                          message.serverContent &&
                                          message.serverContent.modelTurn &&
                                          message.serverContent.modelTurn.parts
                                    ) {
                                          for (const part of message.serverContent.modelTurn.parts) {
                                                if (part.inlineData && part.inlineData.data) {
                                                      ws.send(
                                                            JSON.stringify({
                                                                  type: "audio",
                                                                  data: part.inlineData.data,
                                                            })
                                                      );
                                                }
                                                if (part.text) {
                                                      try {
                                                            const jsonMatch = part.text.match(/\{[\s\S]*\}/);
                                                            if (jsonMatch) {
                                                                  const payload = JSON.parse(jsonMatch[0]);
                                                                  ws.send(JSON.stringify({
                                                                        type: "mist_event",
                                                                        payload
                                                                  }));
                                                            }
                                                      } catch (e) {
                                                            console.error("Failed to parse Gemini text to JSON:", e);
                                                      }
                                                }
                                          }
                                    }

                                    if (
                                          message.serverContent &&
                                          message.serverContent.turnComplete
                                    ) {
                                          ws.send(JSON.stringify({ type: "turn_complete" }));
                                    }
                              },
                              onerror: (e) => {
                                    console.error(`[Room ${roomId}] Gemini Live error:`, e.message || e);
                                    ws.send(
                                          JSON.stringify({
                                                type: "error",
                                                message: e.message || "Gemini Live error",
                                          })
                                    );
                              },
                              onclose: (e) => {
                                    console.log(`[Room ${roomId}] Gemini Live session closed:`, e?.reason || "unknown");
                              },
                        },
                  });
            } catch (err) {
                  console.error(`[Room ${roomId}] Failed to connect to Gemini Live:`, err.message);
                  ws.send(
                        JSON.stringify({
                              type: "error",
                              message: "Failed to connect to Gemini Live API",
                        })
                  );
                  ws.close();
                  return;
            }

            ws.on("message", (raw) => {
                  try {
                        const msg = JSON.parse(raw.toString());

                        if (msg.type === "audio" && msg.data) {
                              geminiSession.sendRealtimeInput({
                                    audio: {
                                          data: msg.data,
                                          mimeType: "audio/pcm;rate=16000",
                                    },
                              });
                        } else if (msg.type === "video" && msg.data) {
                              geminiSession.sendRealtimeInput({
                                    video: {
                                          data: msg.data,
                                          mimeType: "image/jpeg",
                                    },
                              });
                        }
                  } catch (err) {
                        console.error(`[Room ${roomId}] Error processing message:`, err.message);
                  }
            });

            ws.on("close", () => {
                  console.log(`[Room ${roomId}] Client disconnected`);
                  leaveRoom(roomId, ws);
                  if (geminiSession) {
                        try {
                              geminiSession.close();
                        } catch (e) {
                        }
                        geminiSession = null;
                  }
            });

            ws.on("error", (err) => {
                  console.error(`[Room ${roomId}] WebSocket error:`, err.message);
            });
      });
}

main().catch((err) => {
      console.error("Server error:", err);
      process.exit(1);
});
