-- Create speakers table
CREATE TABLE speakers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  title TEXT,
  party TEXT,
  url TEXT,
  image_url TEXT
);

-- Create commons table
CREATE TABLE commons (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT,
  speaker_ids TEXT[],
  speeches JSONB
);

-- Create gpt_responses table
CREATE TABLE gpt_responses (
  id SERIAL PRIMARY KEY,
  debate_id INTEGER REFERENCES commons(id),
  response TEXT
);

-- Enable RLS on all tables
ALTER TABLE speakers ENABLE ROW LEVEL SECURITY;
ALTER TABLE commons ENABLE ROW LEVEL SECURITY;
ALTER TABLE gpt_responses ENABLE ROW LEVEL SECURITY;

-- Create policies for speakers table
CREATE POLICY "Allow read access to authenticated users for speakers" ON speakers
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Allow insert/update access to authenticated users for speakers" ON speakers
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
  
CREATE POLICY "Allow update access to authenticated users for speakers" ON speakers
  FOR UPDATE USING (auth.role() = 'authenticated');

-- Create policies for commons table
CREATE POLICY "Allow read access to authenticated users for commons" ON commons
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Allow insert/update access to authenticated users for commons" ON commons
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
  
CREATE POLICY "Allow update access to authenticated users for commons" ON commons
  FOR UPDATE USING (auth.role() = 'authenticated');

-- Create policies for gpt_responses table
CREATE POLICY "Allow read access to authenticated users for gpt_responses" ON gpt_responses
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Allow insert/update access to authenticated users for gpt_responses" ON gpt_responses
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
  
CREATE POLICY "Allow update access to authenticated users for gpt_responses" ON gpt_responses
  FOR UPDATE USING (auth.role() = 'authenticated');