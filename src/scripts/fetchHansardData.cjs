const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const path = require('path');
const fs = require('fs');

// Use dynamic import for node-fetch
let fetch;
(async () => {
    const { default: _fetch } = await import('node-fetch');
    fetch = _fetch;
})();

async function getLastSittingDate(house) {
    const response = await fetch(`https://hansard-api.parliament.uk/overview/lastsittingdate.json?house=${house}`);
    const dateStr = await response.json();
    // Remove any quotes and trim whitespace
    return dateStr.replace(/"/g, '').trim();
}

async function fetchHansardData(options) {
    // Ensure fetch is available
    if (!fetch) {
        const { default: _fetch } = await import('node-fetch');
        fetch = _fetch;
    }

    const baseUrl = 'https://hansard-api.parliament.uk';
    const { startDate, endDate, house, sections } = options;

    if (!startDate) {
        throw new Error('Start date is required');
    }

    // Process each date in the range
    const dates = [];
    if (endDate) {
        let currentDate = new Date(startDate);
        const end = new Date(endDate);
        while (currentDate <= end) {
            dates.push(currentDate.toISOString().split('T')[0]);
            currentDate.setDate(currentDate.getDate() + 1);
        }
    } else {
        dates.push(startDate);
    }

    console.log('Processing dates:', dates);

    for (const date of dates) {
        const outputDir = path.join(__dirname, 'hansard', date);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        try {
            // Filter houses based on input
            const houses = house ? [house] : ['Commons', 'Lords'];
            
            for (const currentHouse of houses) {
                console.log(`Processing ${currentHouse} data for ${date}`);
                
                // Get available sections
                const sectionsUrl = `${baseUrl}/overview/sectionsforday.json?date=${date}&house=${currentHouse}`;
                const sectionsResponse = await fetch(sectionsUrl);
                const availableSections = await sectionsResponse.json();
                
                // Filter sections based on input
                const sectionsToProcess = sections ? 
                    availableSections.filter(s => sections.includes(s)) : 
                    availableSections;

                if (sectionsToProcess.length === 0) {
                    console.log(`No matching sections found for ${currentHouse} on ${date}`);
                    continue;
                }

                console.log(`Processing sections for ${currentHouse}:`, sectionsToProcess);

                const houseDir = path.join(outputDir, currentHouse.toLowerCase());
                if (!fs.existsSync(houseDir)) {
                    fs.mkdirSync(houseDir, { recursive: true });
                }

                // Process each section
                for (const section of sectionsToProcess) {
                    console.log(`Processing section: ${section}`);
                    
                    const sectionDir = path.join(houseDir, section.toLowerCase());
                    if (!fs.existsSync(sectionDir)) {
                        fs.mkdirSync(sectionDir, { recursive: true });
                    }

                    try {
                        // Get section tree data
                        const sectionTreeUrl = `${baseUrl}/overview/sectiontrees.json?section=${section}&date=${date}&house=${currentHouse}`;
                        const sectionTreeResponse = await fetch(sectionTreeUrl);
                        const sectionTreeData = await sectionTreeResponse.json();

                        // Save section tree data
                        fs.writeFileSync(
                            path.join(sectionDir, 'section_tree.json'),
                            JSON.stringify(sectionTreeData, null, 2)
                        );

                        // Process section tree items recursively
                        const processedIds = new Set();
                        
                        async function processSectionTreeItems(items) {
                            if (!Array.isArray(items)) return;

                            for (const item of items) {
                                // Skip parent debate nodes (they have null ParentId)
                                if (item.ParentId === null) {
                                    // Process children but don't fetch debate for parent
                                    if (item.SectionTreeItems) {
                                        await processSectionTreeItems(item.SectionTreeItems);
                                    }
                                    continue;
                                }

                                if (item.ExternalId && !processedIds.has(item.ExternalId)) {
                                    processedIds.add(item.ExternalId);

                                    // Create safe directory name
                                    const safeName = item.Title
                                        .trim()
                                        .replace(/[^a-zA-Z0-9\s-]/g, '')
                                        .replace(/\s+/g, '-')
                                        .toLowerCase()
                                        .substring(0, 80);

                                    const shortId = item.ExternalId.substring(0, 8);
                                    const dirName = `${safeName}-${shortId}`;
                                    
                                    const itemDir = path.join(sectionDir, dirName);
                                    if (!fs.existsSync(itemDir)) {
                                        fs.mkdirSync(itemDir, { recursive: true });
                                    }

                                    // Save metadata
                                    fs.writeFileSync(
                                        path.join(itemDir, 'metadata.json'),
                                        JSON.stringify(item, null, 2)
                                    );

                                    try {
                                        // Fetch debate data
                                        const debateUrl = `${baseUrl}/debates/debate/${item.ExternalId}.json`;
                                        const debateResponse = await fetch(debateUrl);
                                        const debateData = await debateResponse.json();

                                        fs.writeFileSync(
                                            path.join(itemDir, 'debate.json'),
                                            JSON.stringify(debateData, null, 2)
                                        );

                                        console.log(`Saved debate data for: ${item.Title}`);
                                        
                                        // Rate limiting
                                        await new Promise(resolve => setTimeout(resolve, 500));
                                    } catch (debateError) {
                                        console.error(`Error fetching debate ${item.ExternalId}:`, debateError.message);
                                    }
                                }

                                if (item.SectionTreeItems) {
                                    await processSectionTreeItems(item.SectionTreeItems);
                                }
                            }
                        }

                        if (Array.isArray(sectionTreeData)) {
                            await processSectionTreeItems(sectionTreeData);
                        }

                    } catch (sectionError) {
                        console.error(`Error processing section ${section}:`, sectionError.message);
                    }
                }
            }
        } catch (error) {
            console.error(`Error processing date ${date}:`, error.message);
        }
    }
}

// Main execution
if (require.main === module) {
    const parser = yargs(hideBin(process.argv))
        .option('date', {
            alias: 'd',
            description: 'Single date in YYYY-MM-DD format',
            type: 'string'
        })
        .option('start-date', {
            alias: 's',
            description: 'Start date in YYYY-MM-DD format',
            type: 'string'
        })
        .option('end-date', {
            alias: 'e',
            description: 'End date in YYYY-MM-DD format',
            type: 'string'
        })
        .option('latest', {
            alias: 'l',
            description: 'Fetch most recent date',
            type: 'boolean'
        })
        .option('house', {
            alias: 'h',
            description: 'Specify house (Commons or Lords)',
            choices: ['Commons', 'Lords'],
            type: 'string'
        })
        .option('sections', {
            alias: 'S',
            description: 'Comma-separated list of sections',
            type: 'string',
            coerce: arg => arg.split(',')
        })
        .conflicts('date', ['start-date', 'end-date', 'latest'])
        .conflicts('latest', ['start-date', 'end-date']);

    async function main() {
        try {
            if (!fetch) {
                const { default: _fetch } = await import('node-fetch');
                fetch = _fetch;
            }

            const argv = await parser.parse();

            let startDate;
            if (argv.latest) {
                if (argv.house) {
                    startDate = await getLastSittingDate(argv.house);
                } else {
                    const [commonsDate, lordsDate] = await Promise.all([
                        getLastSittingDate('Commons'),
                        getLastSittingDate('Lords')
                    ]);

                    // Compare dates and use the most recent
                    startDate = new Date(commonsDate) > new Date(lordsDate) ? commonsDate : lordsDate;
                }
            } else {
                startDate = argv.date || argv.startDate;
            }

            if (!startDate) {
                throw new Error('Please provide either --date, --start-date, or --latest');
            }

            console.log('Start date:', startDate);

            await fetchHansardData({
                startDate,
                endDate: argv.endDate,
                house: argv.house,
                sections: argv.sections
            });

            console.log('Done');
        } catch (error) {
            console.error('Script failed:', error);
            process.exit(1);
        }
    }

    main();
}

module.exports = fetchHansardData;