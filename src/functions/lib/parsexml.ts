import { SAXParser } from "https://deno.land/x/sax_ts@v1.2.11/src/sax.ts";

interface Speech {
  speakername: string;
  speech_text: string;
}

interface Debate {
  id: string;
  title: string;
  type: string;
  speaker_ids: string[];
  speeches: Speech[];
}

export function parseXML(xmlData: string): Debate[] {
  const debates: Debate[] = [];
  let currentDebate: Debate | null = null;
  let currentSpeech: Speech | null = null;
  let currentText = "";
  let currentType = "";

  const parser = new SAXParser(false, {});

  parser.onopentag = (node: any) => {
    switch (node.name) {
      case "MAJOR-HEADING":
        currentType = "";
        currentText = "";
        break;
      case "MINOR-HEADING":
        if (currentDebate) {
          debates.push(currentDebate);
        }
        currentDebate = {
          id: node.attributes.ID.split("/").pop() || "",
          title: "",
          type: currentType,
          speaker_ids: [],
          speeches: [],
        };
        currentText = "";
        break;
      case "SPEECH":
        currentSpeech = {
          speakername: node.attributes.speakername || "",
          speech_text: "",
        };
        if (node.attributes.person_id) {
          const speakerId = node.attributes.person_id.split("/").pop() || "";
          if (currentDebate && !currentDebate.speaker_ids.includes(speakerId)) {
            currentDebate.speaker_ids.push(speakerId);
          }
        }
        break;
      case "P":
        currentText = "";
        break;
    }
  };

  parser.ontext = (text: any) => {
    currentText += text.trim() + " ";
  };

  parser.onclosetag = (tagName: any) => {
    switch (tagName) {
      case "MAJOR-HEADING":
        currentType = currentText.trim();
        break;
      case "MINOR-HEADING":
        if (currentDebate) {
          currentDebate.title = currentText.trim();
        }
        break;
      case "P":
        if (currentSpeech) {
          currentSpeech.speech_text += currentText.trim() + " ";
        }
        break;
      case "SPEECH":
        if (currentDebate && currentSpeech) {
          currentSpeech.speech_text = currentSpeech.speech_text.trim();
          currentDebate.speeches.push(currentSpeech);
          currentSpeech = null;
        }
        break;
    }
    currentText = "";
  };

  parser.onend = () => {
    if (currentDebate) {
      debates.push(currentDebate);
    }
  };

  parser.write(xmlData).close();

  return debates;
}