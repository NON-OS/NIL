// The chat channels, who starts each, and what is said in them, in order.
export default [
  {
    maker: 'ada',
    name: 'atlas-launch',
    topic: 'Atlas 2.0, out on 8 December',
    lines: [
      ['ada', 'Morning! The launch date proposal is 8 December. Shout by Thursday if that does not work for you.'],
      ['cleo', 'Works for me. The TestFlight build goes out tomorrow, so the beta gets a full week with the release candidate.'],
      ['ben', 'Onboarding is two screens from done. The biometric unlock screens are in Files, under Design.'],
      ['dev', 'I will have the release notes drafted by Monday. @Ben can I borrow the onboarding screens for the store listing?'],
      ['ben', 'Of course, they are all in Design / Onboarding.'],
      ['ada', 'Perfect. Security review with @Cleo on Thursday, then we freeze.'],
    ],
  },
  {
    maker: 'ada',
    name: 'general',
    topic: 'Anything for the whole team',
    lines: [
      ['dev', 'The vote on dates for Lisbon is open until Friday. Two venues are holding both weekends.'],
      ['ada', 'Voted. The courtyard looks lovely.'],
      ['cleo', 'Heads up: renewing the TLS certificates tonight at 22:00. The status page may blink for a minute.'],
      ['ben', 'Lunch talk on Friday: how we test with real people. Twenty minutes, bring questions.'],
    ],
  },
  {
    maker: 'ben',
    name: 'design',
    topic: 'Work in progress, feedback welcome',
    lines: [
      ['ben', 'New homepage hero, feedback welcome. The second line is the one I am least sure about.'],
      ['dev', 'Love it. Could we try the blue circle a bit smaller so the headline breathes?'],
      ['ada', 'Agree, and the headline should fit on one line on phones.'],
    ],
  },
];
