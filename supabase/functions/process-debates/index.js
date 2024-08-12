import { main } from '../../../src/functions/main'

export const handler = async (event, context) => {
  try {
    const result = await main(event, context)
    return { statusCode: 200, body: JSON.stringify(result) }
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) }
  }
}