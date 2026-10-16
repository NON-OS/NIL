// The sample project: three ordinary plans a small team might have on the go. `due` counts days
// from the person's today; `mine` assigns the task to whoever added the sample.
const sampleContent = Object.freeze({
  project: {
    name: 'Sample project',
    key: 'SMPL',
    description: 'A website launch, a team offsite and a hiring round, to show how Nil works. Remove it from My work whenever you like.',
  },
  tasks: [
    {
      title: 'Write the homepage copy',
      status: 'in_progress',
      priority: 3,
      due: 2,
      mine: true,
      description: 'Keep it short: what we do, who it’s for and one clear next step.\n\nAsk Sam for the product photos before Thursday.',
      checklist: [
        { text: 'Headline and one-line pitch', done: true },
        { text: 'Three short sections on what we offer', done: false },
        { text: 'Call to action', done: false },
      ],
    },
    {
      title: 'Pick a launch date and tell the team',
      status: 'todo',
      priority: 2,
      due: 3,
      mine: true,
      description: 'Avoid the week of the offsite.',
    },
    {
      title: 'Check every page on a phone',
      status: 'todo',
      priority: 2,
      due: 5,
      checklist: [
        { text: 'Home', done: false },
        { text: 'Pricing', done: false },
        { text: 'Contact form sends', done: false },
        { text: 'Images load quickly', done: false },
      ],
    },
    {
      title: 'Book a venue for the team offsite',
      status: 'todo',
      priority: 3,
      due: 7,
      mine: true,
      description: 'Somewhere we can all reach by train, with a room for 12 and space to go outside.\n\nShortlist:\n- The old library hall\n- Lakeside cabins\n- The loft downtown',
    },
    {
      title: 'Ask everyone about food and travel needs',
      status: 'todo',
      priority: 1,
      due: 6,
    },
    {
      title: 'Plan the offsite agenda',
      status: 'backlog',
      priority: 1,
      due: 14,
      checklist: [
        { text: 'Morning: where we are and what’s next', done: false },
        { text: 'Lunch together', done: false },
        { text: 'Afternoon: one big problem to solve', done: false },
        { text: 'Something fun to end the day', done: false },
      ],
    },
    {
      title: 'Post the designer job ad',
      status: 'in_review',
      priority: 2,
      due: 1,
      mine: true,
      description: 'The final draft is ready. Check the salary range and the closing date, then post it on our site.',
    },
    {
      title: 'Shortlist candidates for first calls',
      status: 'todo',
      priority: 2,
      due: 10,
      checklist: [
        { text: 'Read every application', done: false },
        { text: 'Pick up to eight for a first call', done: false },
        { text: 'Send a kind reply to everyone else', done: false },
      ],
    },
    {
      title: 'Book interview slots with the panel',
      status: 'backlog',
      priority: 1,
      due: 12,
    },
  ],
});

export default sampleContent;
