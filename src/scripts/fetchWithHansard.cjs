const fs = require('fs');
const path = require('path');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// Function to create a safe directory name from title
function createSafeDirectoryName(title, externalId) {
    // Remove any characters that aren't alphanumeric, spaces, or hyphens
    let safeName = title
        .trim()
        .replace(/[^a-zA-Z0-9\s-]/g, '')  // Remove special characters
        .replace(/\s+/g, '-')             // Replace spaces with hyphens
        .replace(/-+/g, '-')              // Replace multiple hyphens with single hyphen
        .toLowerCase();
    
    // Ensure the directory name isn't too long
    safeName = safeName.substring(0, 80);
    
    // Add first 8 chars of externalId for uniqueness
    const shortId = externalId.substring(0, 8);
    return `${safeName}-${shortId}`;
}

async function fetchHansardData(date) {
    const baseUrl = 'https://hansard-api.parliament.uk';
    const outputDir = path.join(__dirname, 'hansard', date);

    // Create output directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    try {
        const houses = ['Commons', 'Lords'];
        
        for (const house of houses) {
            console.log(`Processing ${house} data for ${date}`);
            
            // Step 1: Get available sections for the house
            const sectionsUrl = `${baseUrl}/overview/sectionsforday.json?date=${date}&house=${house}`;
            const sectionsResponse = await fetch(sectionsUrl);
            const sections = await sectionsResponse.json();
            
            console.log(`Found sections for ${house}:`, sections);

            // Create house-specific directory
            const houseDir = path.join(outputDir, house.toLowerCase());
            if (!fs.existsSync(houseDir)) {
                fs.mkdirSync(houseDir, { recursive: true });
            }

            // Step 2: Process each section
            for (const section of sections) {
                console.log(`Processing section: ${section}`);
                
                // Create section-specific directory using lowercase section name
                const sectionDir = path.join(houseDir, section.toLowerCase());
                if (!fs.existsSync(sectionDir)) {
                    fs.mkdirSync(sectionDir, { recursive: true });
                }

                try {
                    // Get section tree data
                    const sectionTreeUrl = `${baseUrl}/overview/sectiontrees.json?section=${section}&date=${date}&house=${house}`;
                    const sectionTreeResponse = await fetch(sectionTreeUrl);
                    const sectionTreeData = await sectionTreeResponse.json();

                    // Save section tree data
                    const treeFilePath = path.join(sectionDir, 'section_tree.json');
                    fs.writeFileSync(
                        treeFilePath,
                        JSON.stringify(sectionTreeData, null, 2),
                        'utf8'
                    );

                    // Keep track of processed ExternalIds to avoid duplicates
                    const processedIds = new Set();

                    // Function to recursively process section tree items
                    async function processSectionTreeItems(items) {
                        if (!Array.isArray(items)) return;

                        for (const item of items) {
                            if (item.ExternalId && !processedIds.has(item.ExternalId)) {
                                processedIds.add(item.ExternalId);

                                // Create safe directory name from title
                                const dirName = createSafeDirectoryName(item.Title, item.ExternalId);
                                const itemDir = path.join(sectionDir, dirName);
                                
                                // Create directory if it doesn't exist
                                if (!fs.existsSync(itemDir)) {
                                    fs.mkdirSync(itemDir, { recursive: true });
                                }

                                // Save item metadata including ExternalId
                                const metadataPath = path.join(itemDir, 'metadata.json');
                                fs.writeFileSync(
                                    metadataPath,
                                    JSON.stringify(item, null, 2),
                                    'utf8'
                                );

                                try {
                                    // Fetch and save debate data if available
                                    const debateUrl = `${baseUrl}/debates/debate/${item.ExternalId}.json`;
                                    const debateResponse = await fetch(debateUrl);
                                    const debateData = await debateResponse.json();

                                    const debatePath = path.join(itemDir, 'debate.json');
                                    fs.writeFileSync(
                                        debatePath,
                                        JSON.stringify(debateData, null, 2),
                                        'utf8'
                                    );

                                    console.log(`Saved debate data for: ${item.Title} (${item.ExternalId})`);

                                    // Add delay to avoid rate limiting
                                    await new Promise(resolve => setTimeout(resolve, 500));

                                } catch (debateError) {
                                    console.error(`Error fetching debate ${item.ExternalId}:`, debateError.message);
                                }
                            }

                            // Process child sections if they exist
                            if (item.SectionTreeItems) {
                                await processSectionTreeItems(item.SectionTreeItems);
                            }
                        }
                    }

                    // Process all items in the section tree
                    if (Array.isArray(sectionTreeData)) {
                        await processSectionTreeItems(sectionTreeData);
                    }

                } catch (sectionError) {
                    console.error(`Error processing section ${section}:`, sectionError.message);
                }
            }
        }

        console.log(`Completed processing all data for ${date}`);

    } catch (error) {
        console.error('Error fetching Hansard data:', error.message);
        throw error;
    }
}

// Example usage
if (require.main === module) {
    const argv = yargs(hideBin(process.argv))
        // ... existing options ...
        .middleware(async (argv) => {
            if (argv.latest) {
                // Fetch last sitting date for both houses if no specific house is provided
                if (argv.house) {
                    const response = await fetch(`https://hansard-api.parliament.uk/overview/lastsittingdate.json?house=${argv.house}`);
                    const date = await response.json();
                    argv.startDate = date;
                } else {
                    // Fetch for both houses and use the most recent date
                    const [commonsResponse, lordsResponse] = await Promise.all([
                        fetch('https://hansard-api.parliament.uk/overview/lastsittingdate.json?house=Commons'),
                        fetch('https://hansard-api.parliament.uk/overview/lastsittingdate.json?house=Lords')
                    ]);
                    
                    const [commonsDate, lordsDate] = await Promise.all([
                        commonsResponse.json(),
                        lordsResponse.json()
                    ]);

                    // Compare dates and use the most recent one
                    argv.startDate = new Date(commonsDate) > new Date(lordsDate) ? commonsDate : lordsDate;
                }
            } else {
                argv.startDate = argv.date || argv.startDate;
            }
        })
}

module.exports = fetchHansardData;