import type { Period, ProjectSplitDay, ResourceData } from './resourceService';

/** Preview-only Resource Allocation dataset (`npm run dev` → ?page=resource). */
export function MOCK_RESOURCE_DATA(period: Period): ResourceData {
  interface Seed {
    name: string;
    role: string;
    leave: number;
    projects: [string, number[]][]; // project → hrs per weekday (5)
  }
  const seeds: Seed[] = [
    { name: 'RamPrathap P', role: 'Project Lead', leave: 0, projects: [['M365 Implementation', [7, 5, 5, 4, 3]], ['IT Helpdesk Chatbot', [5, 4, 3, 3, 3]]] },
    { name: 'Venkata Teja K', role: 'Developer', leave: 8, projects: [['IT Helpdesk Chatbot', [5, 5, 6, 5, 0]], ['Travel Request', [3, 3, 3, 3, 0]]] },
    { name: 'Ali Abuthahir', role: 'Technical Lead', leave: 0, projects: [['User Onboarding', [7, 7, 6, 6, 5]]] },
    { name: 'Rajesh K', role: 'Developer', leave: 0, projects: [['Travel Request', [4, 4, 3, 3, 2]]] },
    { name: 'Shanmathi R', role: 'QA/QC', leave: 16, projects: [['M365 Implementation', [2, 2, 2, 1, 1]]] },
    { name: 'Kamal V', role: 'Developer', leave: 0, projects: [['Digital Marketing', [1, 1, 1, 1, 0]]] },
  ];

  const nDays = period.days.length;
  const expand = (weekday: number[]): number[] =>
    Array.from({ length: nDays }, (_, i) => weekday[i % 5]);

  const people = seeds.map((s) => {
    const byProject: ProjectSplitDay[] = s.projects.map(([project, wk]) => {
      const day = expand(wk);
      return { project, day, total: Math.round(day.reduce((a, b) => a + b, 0) * 10) / 10 };
    });
    const byDay = Array.from({ length: nDays }, (_, i) =>
      byProject.reduce((a, bp) => a + bp.day[i], 0),
    );
    const capacityHrs = nDays * 8;
    const allocatedHrs = Math.round(byProject.reduce((a, b) => a + b.total, 0) * 10) / 10;
    const effective = Math.max(1, capacityHrs - s.leave);
    // Spread the seed's leave onto whole days from the start of the period.
    const leaveByDay = Array.from({ length: nDays }, (_, i) =>
      Math.min(8, Math.max(0, s.leave - i * 8)),
    );
    return {
      name: s.name,
      role: s.role,
      capacityHrs,
      leaveHrs: s.leave,
      leaveByDay,
      allocatedHrs,
      utilPct: Math.round((allocatedHrs / effective) * 100),
      byDay,
      byProject,
      work: byProject.map((bp) => ({ project: bp.project, stories: 1, tasks: 3, bugs: 1, completed: 5, inprog: 2 })),
      items: byProject.map((bp, i) => ({
        id: 22000 + i,
        title: `Sample task on ${bp.project}`,
        type: 'Task',
        state: 'Active',
        project: bp.project,
        hrs: bp.total,
        day: bp.day,
      })),
      unscheduled: [],
      unscheduledHrs: 0,
      timesheetHrs: 0,
    };
  });

  const projMap = new Map<string, { byDay: number[]; people: Map<string, number> }>();
  for (const p of people) {
    for (const bp of p.byProject) {
      let e = projMap.get(bp.project);
      if (!e) {
        e = { byDay: Array.from({ length: nDays }, () => 0), people: new Map() };
        projMap.set(bp.project, e);
      }
      bp.day.forEach((h, i) => {
        e!.byDay[i] += h;
      });
      e.people.set(p.name, (e.people.get(p.name) ?? 0) + bp.total);
    }
  }

  const totalCapacity = people.reduce((a, r) => a + r.capacityHrs - r.leaveHrs, 0);
  const totalAllocated = people.reduce((a, r) => a + r.allocatedHrs, 0);
  return {
    period,
    people,
    projects: [...projMap.entries()]
      .map(([name, v]) => ({
        name,
        lead: 'RamPrathap P',
        total: Math.round(v.byDay.reduce((a, b) => a + b, 0) * 10) / 10,
        byDay: v.byDay,
        people: [...v.people.entries()].map(([n, hrs]) => ({ name: n, hrs })).sort((a, b) => b.hrs - a.hrs),
      }))
      .sort((a, b) => b.total - a.total),
    totalCapacity,
    totalAllocated: Math.round(totalAllocated * 10) / 10,
    utilPct: Math.round((totalAllocated / totalCapacity) * 100),
    underCount: people.filter((r) => r.utilPct < 60).length,
    overCount: people.filter((r) => r.utilPct > 100).length,
    leaveConnected: false,
    timesheetConnected: false,
  };
}
