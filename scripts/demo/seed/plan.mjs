import api from '../lib/api.mjs';
import isoDay from '../lib/isoDay.mjs';

// [key, name, prefix, colour, description, lead]
const PROJECTS = [
  ['atl', 'Atlas 2.0', 'ATL', '#3b4fe0', 'Ship the redesigned wallet to the App Store and Google Play before the holidays.', 'ada'],
  ['web', 'Website', 'WEB', '#0e9384', 'A new marketing site and docs for the 2.0 launch.', 'ben'],
  ['hir', 'Hiring', 'HIR', '#d4582a', 'Two engineers by the end of the year.', 'ada'],
  ['off', 'Lisbon offsite', 'OFF', '#7c4ddb', 'Three days in March for the whole team.', 'dev'],
];
const LABELS = [
  ['Design', '#c2348a'],
  ['Bug', '#d13f3f'],
  ['Copy', '#b8860b'],
  ['Research', '#1f7fb8'],
  ['Security', '#2f8a3b'],
  ['Infra', '#5b6577'],
];

async function goals({ pages, uid }) {
  const add = async (who, body) => (await api(pages[who], 'POST', '/goals', body)).goal.id;
  return {
    ship: await add('ada', { title: 'Ship Atlas 2.0 to both app stores', description: 'Public release on iOS and Android, with the new onboarding and hardware wallet support.', targetDate: isoDay(38), status: 'on_track', metricName: 'Beta testers', metricStart: 120, metricCurrent: 412, metricTarget: 500 }),
    hire: await add('ada', { title: 'Hire two engineers', description: 'One senior mobile engineer and one backend engineer.', targetDate: isoDay(63), status: 'at_risk', ownerId: uid.ada, metricName: 'Offers accepted', metricStart: 0, metricCurrent: 1, metricTarget: 2 }),
    site: await add('ben', { title: 'Launch the new website', description: 'Homepage, pricing and docs on the new design.', targetDate: isoDay(21), status: 'on_track', metricName: 'Pages done', metricStart: 0, metricCurrent: 9, metricTarget: 14 }),
  };
}

// The four projects, the labels tasks carry, and the three goals the work counts toward.
export default async function plan(team) {
  const { pages, uid } = team;
  const proj = {};
  for (const [k, name, key, color, description, lead] of PROJECTS) {
    proj[k] = (await api(pages.ada, 'POST', '/projects', { name, key, color, description, leadId: uid[lead] })).project.id;
  }
  const label = {};
  for (const [name, color] of LABELS) label[name] = (await api(pages.ada, 'POST', '/labels', { name, color })).label.id;
  return { proj, label, goal: await goals(team) };
}
