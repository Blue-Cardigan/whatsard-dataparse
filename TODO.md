Store speech id, mark speakers referenced with an annotation for markdown display

Store PublicWhip votes data for vote subcategory
Retrieve ongoing bills and link with debates
- Written Statements are relevant context
Only store start time for questions instead of repeating it for all messages
Handle inconsistencies in original data like 'Speaker' instead of speaker's name, or when in type
Extract name of introducing speaker at end of each day.
Identify speaker/deputy to place below presenting minister

Generate LLM title for debates
Add speakers spending and SM data (e.g people.json )
Add parliamentary schedule

Implement:
RAG pipeline to research related coverage


**Automate with Github Actions
- at 6:30, then 12:30
- Retrieve all from last date in supabase (excluding weekends) instead of specifying date
**Split topics and tags in search

#Generate
**Implement forced output json
**Include 'commitments' in analysis
Link to Parliament.uk site instead of TWFY