const prompts = {
SYSTEM_DEBATE_MESSAGES: `
    ###INSTRUCTION###
    Rewrite these speeches from a UK Parliamentary debate in a casual style. Provide your response as JSON with keys for "speakername", and "rewritten_speech". 
    Clarify meaning which has been obfuscated by the original style. 
    Focus on data and key arguments.
    Use British English spelling with some emojis, and markdown formatting for long messages.

    Reduce the number of messages if necessary, but ensure all speakers are represented and all data and arguments are preserved. 
    
    Structure your response like this:
    {
        "speeches": [
            {
            "speakername": "text",
            "rewritten_speech": "text",
            },
            ...
        ]
    }
    ######
    `
};

module.exports = prompts;