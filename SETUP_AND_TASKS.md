# 🚑 Project Setup & Master Task List

---

## ☁️ 1. Cloud & Infrastructure (Hackathon Requirements)
*The system must run on Google Cloud Platform (GCP) and use Gemini AI models via the official SDK/ADK.*

- [ ] **GCP Project Setup:** Create a new project, link billing, and enable the Vertex AI API and a Database/Storage API.
- [ ] **Service Authentication:** Generate and securely store Service Account keys for the backend to communicate with GCP services.
- [ ] **Database Initialization:** Set up a cloud database on GCP to store the structured medical logs.
- [ ] **Production Hosting Environment:** Set up the target GCP environment (e.g., Cloud Run, App Engine, or Compute Engine) to host the backend.
- [ ] **(Bonus) Infrastructure Automation:** Write deployment scripts or use Infrastructure-as-Code (IaC) to automate the GCP deployment.

---

## ⚙️ 2. Backend Orchestration Server
*The middleman bridging the field app, the AI, and the database.*

- [ ] **Streaming Server Setup:** Initialize a backend server capable of handling continuous, bidirectional streams (e.g., WebSockets or WebRTC).
- [ ] **AI SDK Integration:** Integrate the official **Google Gen AI SDK** or **Agent Development Kit (ADK)** to connect to the Gemini Multimodal Live API.
- [ ] **Stream Routing:** Write the logic to accept incoming audio/video from the mobile client, pipe it to Gemini, and route Gemini's audio response back to the client.
- [ ] **Data Extraction Logic:** Configure the AI prompt/system instructions to output structured data (JSON) whenever a medical event occurs, alongside its normal voice response.
- [ ] **Database Integration:** Write a listener that intercepts the structured data from the AI and saves it directly to the GCP database with timestamps.

---

## 📱 3. Mobile View (The Paramedic Field Client)
*The hands-free device capturing the scene. Must prioritize low latency and ease of use.*

- [ ] **Mobile UI Layout:** Build a high-contrast, simple interface (e.g., a massive "Start Mission" button, connection status indicator, and a live AI-speaking indicator).
- [ ] **Hardware Permissions:** Implement strict OS-level permission requests for the Camera and Microphone.
- [ ] **Media Capture (Video):** Write the logic to access the camera, capture frames, and compress/downsample them (e.g., 1 frame per second) to optimize network bandwidth.
- [ ] **Media Capture (Audio):** Continuously capture raw audio from the microphone to stream to the backend.
- [ ] **Stream Connection:** Implement the client-side streaming protocol to send media to the backend and maintain the connection.
- [ ] **Audio Playback:** Receive the AI's generated audio stream from the backend and play it through the device's speakers seamlessly.
- [ ] **Barge-in/Interrupt Handling:** Build logic that detects when the paramedic starts speaking while the AI is talking, instantly sending a signal to halt the AI's current audio playback.

---

## 💻 4. Web View (The Hospital Command Dashboard)
*The interface where doctors or dispatchers view the AI's auto-generated logs in real-time.*

- [ ] **Web UI Layout:** Design a clean dashboard featuring a data table for incident logs, patient vitals, and mission timestamps.
- [ ] **Real-time Database Listener:** Connect the web frontend to the GCP database so the UI updates instantly the moment the AI logs a new event, without requiring a page refresh.
- [ ] **Mission Filtering/Sorting:** Add basic UI controls to sort logs by time, event type, or specific active missions.
- [ ] **Authentication (Optional/Basic):** Add a simple login or access token system so the medical data isn't exposed to the public internet.

---

## 🎬 5. Hackathon Submission Deliverables
*The final checklist to ensure we meet all judging criteria.*

- [ ] **Architecture Diagram:** Create a clear visual map showing how the Mobile App, Web Dashboard, Backend, GCP Database, and Gemini API all connect. 
- [ ] **Proof of GCP Deployment:** Record a short screen capture showing the backend running live in the Google Cloud console.
- [ ] **4-Minute Demo Video:** Film the live demonstration showing both the Mobile View (paramedic interacting with AI) and the Web View (logs appearing instantly). Include the project pitch.
- [ ] **Public Repo Polish:** Ensure the `README.md` is clean, all code is pushed, and no API keys are exposed.
- [ ] **(Bonus) Content Publication:** Publish a blog, video, or post about how the project was built using the `#GeminiLiveAgentChallenge` hashtag.
