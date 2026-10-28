import docBody from './docBody';
import stateToJson from './stateToJson';
import jsonText from './jsonText';

// The plain words of a rich doc body, for search in this tab; none for one that fails its check.
export default function stateText(body: string) {
  try {
    return jsonText(stateToJson(docBody.decode(body)).content).trim();
  } catch {
    return '';
  }
}
