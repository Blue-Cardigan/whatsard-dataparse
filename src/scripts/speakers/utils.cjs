const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

function formatUrlPart(str) {
  return str ? encodeURIComponent(str.toLowerCase().replace(/ /g, '_')) : '';
}

async function getImageUrl(personId) {
  const baseUrls = [
    `https://www.theyworkforyou.com/people-images/mpsL/${personId}.jpg`,
    `https://www.theyworkforyou.com/people-images/mps/${personId}.jpg`,
    `https://www.theyworkforyou.com/people-images/mpsL/${personId}.jpeg`,
    `https://www.theyworkforyou.com/people-images/mps/${personId}.jpeg`
  ];

  for (const url of baseUrls) {
    try {
      await axios.head(url);
      return url;
    } catch (error) {
      // Continue to the next URL if the current one fails
    }
  }

  // Return a default image URL if none of the above URLs work
  return "https://www.theyworkforyou.com/images/unknownperson_large.png";
}

async function scrapeProfileInfo(profileUrl) {
  const cabinetData = JSON.parse(fs.readFileSync(path.join(__dirname, 'cabinet.json'), 'utf8'));
  let MP = false;
  let isCurrent = true;
  try {
    const response = await axios.get(profileUrl);
    const $ = cheerio.load(response.data);
    const $about = $('.person-header__about');
    let party = $about.find('.person-header__about__position__role').text().trim();

    if (party.includes(' MP')) {
      party = party.replace(' MP', '');
      MP = true;
    }
    if (party.includes('Former ')) {
      isCurrent = false;
      party = party.replace('Former', '').trim();
    }
    let name = $about.find('.person-header__about__name').text().trim();
    let position, title, department, ministerial_ranking;
    if (MP) {
      const cabinetMember = cabinetData.cabinet.find(member => member.name === name);
      if (cabinetMember) {
        ({ title, department, ministerial_ranking } = cabinetMember);
        title = `${title}`;
        department = `${department}`;
      } else {
        title = $about.find('.person-header__about__position').text().trim();
      }
    } else {
      position = $about.find('.person-header__about__position').text().trim();
    }

    const constituency = $about.find('.person-header__about__position__constituency').text().trim();

    const media = {};
    $about.find('.person-header__about__media a').each((i, el) => {
      const $el = $(el);
      const href = $el.attr('href');
      if (href.includes('twitter.com')) {
        media.twitter = href;
      } else if (href.includes('facebook.com')) {
        media.facebook = href;
      }
    });

    return {
      title,
      department,
      party,
      isCurrent,
      ministerial_ranking,
      constituency,
      media: Object.keys(media).length > 0 ? media : null
    };
  } catch (error) {
    console.error(`Error scraping profile info from ${profileUrl}:`, error.message);
    return null;
  }
}

function generateProfileUrl(speakerId, speakerName, constituency) {
  return `https://www.theyworkforyou.com/mp/${speakerId}/${formatUrlPart(speakerName)}/${formatUrlPart(constituency || '')}`;
}

module.exports = { formatUrlPart, getImageUrl, scrapeProfileInfo, generateProfileUrl };