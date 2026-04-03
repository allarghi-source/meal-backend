require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { GoogleGenAI } = require("@google/genai");
const systemPrompt = require("./systemPrompt");
const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 3001;

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

app.post("/chat", async (req, res) => {
  try {
    const { message, userData } = req.body;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `
DATOS DEL USUARIO:
${JSON.stringify(userData, null, 2)}

MENSAJE:
${message}
`,
      config: {
       
  systemInstruction: systemPrompt,
},
    });

       res.json({
      reply: response.text,
      suggestedMeal: null,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error en el servidor" });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
