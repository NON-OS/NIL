export default interface HelpTopic {
  slug: string;
  title: string;
  // the group it sits under in the help index, from the headings in docs/README.md
  group: string;
  text: string;
  // the text without Markdown punctuation, for search
  plain: string;
}
