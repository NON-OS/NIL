import docBody from './docBody';
import stateToJson from './stateToJson';
import jsonText from './jsonText';

// The plain words of a rich doc body, for search in this tab.
export default function stateText(body: string) {
  return jsonText(stateToJson(docBody.decode(body)).content).trim();
}
