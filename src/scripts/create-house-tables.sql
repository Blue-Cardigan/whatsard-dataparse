-- Core tables
CREATE TABLE business_sessions (
    id TEXT PRIMARY KEY,
    date DATE NOT NULL,
    house TEXT NOT NULL CHECK (house IN ('commons', 'lords', 'westminster_hall', 'committee')),
    start_time TIME,
    end_time TIME,
    duration INTERVAL,
    
    -- Statistics
    speech_count INTEGER DEFAULT 0,
    speaker_count INTEGER DEFAULT 0,
    division_count INTEGER DEFAULT 0,
    
    -- Timestamps
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
);

CREATE TABLE business_items (
    id TEXT PRIMARY KEY,
    session_id TEXT REFERENCES business_sessions(id),
    parent_item_id TEXT REFERENCES business_items(id), -- For nested items
    
    -- Classification
    type_category TEXT NOT NULL,
    type_specific TEXT,
    sequence_number INTEGER,

    -- Members
    chair_id TEXT,
    chair_name TEXT,
    deputy_chair_id TEXT,
    deputy_chair_name TEXT,
    chair_start_time TIME,
    chair_end_time TIME,

    clerks TEXT[],
    witnesses TEXT[],

    lead_minister_name TEXT,
    lead_minister_role TEXT,
    
    -- Content
    title TEXT,
    subtitle TEXT,
    start_time TIME,
    end_time TIME,
    column_start INTEGER,
    column_end INTEGER,
    
    -- Question Time specific fields
    is_question_time BOOLEAN DEFAULT FALSE,
    oral_question_number INTEGER,

    -- Metadata
    extracts JSONB, -- Standing orders, bills, dates etc
    bill_stage TEXT,
    topics TEXT[],
    tags TEXT[],
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Add debate structure fields
    time_allocation TEXT, -- e.g., "3 hours", "Until 5:30pm"
);

CREATE TABLE speeches (
    id TEXT PRIMARY KEY,
    business_item_id TEXT REFERENCES business_items(id),
    
    -- Speaker details (for point-in-time record)
    speaker_id TEXT,
    speaker_name TEXT,
    
    -- Speech content
    time TIME,
    type TEXT NOT NULL,
    content TEXT NOT NULL,
    column_number INTEGER,
    duration INTEGER, -- in minutes
    
    -- Classification
    is_procedural BOOLEAN DEFAULT FALSE,
    oral_question_number TEXT,
    
    -- Relationships
    in_response_to_id TEXT REFERENCES speeches(id),
    extracts TEXT[],
    chair_intervention BOOLEAN DEFAULT FALSE,
    
    -- Add fields for speech relationships
    speech_sequence INTEGER, -- Order within business item
    
    -- Lords specific fields
    oral_qnum TEXT, -- Question number if part of oral questions
    colnum TEXT, -- Column number in Lords Hansard
    procedural BOOLEAN DEFAULT FALSE, -- Flag for procedural statements

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
);

CREATE TABLE divisions (
    id TEXT PRIMARY KEY,
    business_item_id TEXT REFERENCES business_items(id),
    
    -- Division details
    division_number INTEGER,
    time TIME,
    subject TEXT,
    motion_text TEXT,
    
    -- Results
    ayes_count INTEGER NOT NULL,
    noes_count INTEGER NOT NULL,
    result TEXT NOT NULL,
    
    -- Voting details
    votes JSONB NOT NULL, -- Detailed voting records
    tellers JSONB, -- Teller information
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Rename to better reflect purpose
CREATE TABLE debate_participation (
    business_item_id TEXT REFERENCES business_items(id),
    member_id TEXT NOT NULL,
    member_name TEXT NOT NULL,
    
    -- Roles during debate
    roles JSONB, -- Array of {role, start_time, end_time}
    
    -- Participation summary
    contribution_count INTEGER DEFAULT 0,
    contribution_types JSONB, -- e.g., {"speeches": 5, "interventions": 2}
    first_contribution TIME,
    last_contribution TIME,
    
    -- Additional metadata
    is_chair BOOLEAN DEFAULT FALSE,
    is_minister BOOLEAN DEFAULT FALSE,
    is_teller BOOLEAN DEFAULT FALSE,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    PRIMARY KEY (business_item_id, member_id)
);

-- Indexes for common queries
CREATE INDEX idx_business_items_session ON business_items(session_id);
CREATE INDEX idx_business_items_type ON business_items(type_category, type_specific);
CREATE INDEX idx_speeches_business ON speeches(business_item_id);
CREATE INDEX idx_speeches_speaker ON speeches(speaker_id);
CREATE INDEX idx_divisions_business ON divisions(business_item_id);
CREATE INDEX idx_member_participation_member ON debate_participation(member_id);

-- Add foreign key constraints
ALTER TABLE business_items 
    ADD CONSTRAINT fk_parent_item 
    FOREIGN KEY (parent_item_id) 
    REFERENCES business_items(id);

ALTER TABLE speeches 
    ADD CONSTRAINT fk_response_to 
    FOREIGN KEY (in_response_to_id) 
    REFERENCES speeches(id);