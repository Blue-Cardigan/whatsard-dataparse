Store speech id, mark speakers referenced with an annotation for markdown display
Identify subcategories for debates:
    Vote (/divisionsonly and chamber)
    Private members bill
    Party-backed bill
    Petition
    Point of Order
    Prayers
    Speaker's Statement
    Oral Answers to Questions
    Business of the House

Find ongoing bill related with bill discussion subcategory
- Written Statements will be useful
Store PublicWhip votes data for vote subcategory
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