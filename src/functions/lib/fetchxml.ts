export async function fetchXMLData(date: Date = new Date()): Promise<string> {
  const formattedDate = date.toISOString().split('T')[0].replace(/-/g, '-')
  const url = `https://www.theyworkforyou.com/pwdata/scrapedxml/debates/debates${formattedDate}a.xml`
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`)
  }
  return await response.text()
}