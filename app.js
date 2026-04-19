class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  subscribe(eventName, listener) {
    const current = this.listeners.get(eventName) || [];
    current.push(listener);
    this.listeners.set(eventName, current);
  }

  publish(eventName, payload) {
    const current = this.listeners.get(eventName) || [];
    current.forEach((listener) => listener(payload));
  }
}

class BaseTask {
  constructor({ id, title, subject, dueDate, hours, difficulty, type, confidence }) {
    this.id = id;
    this.title = title;
    this.subject = subject;
    this.dueDate = dueDate;
    this.hours = hours;
    this.difficulty = difficulty;
    this.type = type;
    this.confidence = confidence;
  }

  getLabel() {
    return this.type;
  }

  getWeight() {
    const difficultyWeights = { easy: 1, medium: 1.3, hard: 1.7 };
    const confidenceModifier = 1 + (6 - this.confidence) * 0.12;
    return this.hours * (difficultyWeights[this.difficulty] || 1) * confidenceModifier;
  }

  getPriorityScore() {
    return this.getWeight();
  }
}

class ExamTask extends BaseTask {
  getLabel() {
    return "Exam";
  }

  getPriorityScore() {
    return super.getWeight() * 1.7;
  }
}

class HomeworkTask extends BaseTask {
  getLabel() {
    return "Homework";
  }

  getPriorityScore() {
    return super.getWeight() * 1.1;
  }
}

class ProjectTask extends BaseTask {
  getLabel() {
    return "Project";
  }

  getPriorityScore() {
    return super.getWeight() * 1.4;
  }
}

class TaskFactory {
  static createTask(taskData) {
    const taskMap = {
      exam: ExamTask,
      homework: HomeworkTask,
      project: ProjectTask
    };

    const TaskType = taskMap[taskData.type] || BaseTask;
    return new TaskType(taskData);
  }
}

class TaskDecorator {
  constructor(task) {
    this.task = task;
  }

  get id() {
    return this.task.id;
  }

  get title() {
    return this.task.title;
  }

  get subject() {
    return this.task.subject;
  }

  get dueDate() {
    return this.task.dueDate;
  }

  get hours() {
    return this.task.hours;
  }

  get difficulty() {
    return this.task.difficulty;
  }

  get type() {
    return this.task.type;
  }

  get confidence() {
    return this.task.confidence;
  }

  getPriorityScore() {
    return this.task.getPriorityScore();
  }

  getLabel() {
    return this.task.getLabel();
  }
}

class HighPriorityDecorator extends TaskDecorator {
  getPriorityScore() {
    return this.task.getPriorityScore() + 2;
  }
}

class UrgentDecorator extends TaskDecorator {
  getPriorityScore() {
    return this.task.getPriorityScore() + 4;
  }
}

const STORAGE_KEY = "smart-study-planner-state-v1";

class BalancedStrategy {
  buildSchedule(tasks, profile, reflections) {
    return buildGapAwareSchedule(
      [...tasks].sort((a, b) => weightedUrgencyScore(b) - weightedUrgencyScore(a)),
      profile,
      reflections,
      1.5
    );
  }
}

class DeadlineFirstStrategy {
  buildSchedule(tasks, profile, reflections) {
    return buildGapAwareSchedule(
      [...tasks].sort((a, b) => daysUntil(a.dueDate) - daysUntil(b.dueDate) || weightedUrgencyScore(b) - weightedUrgencyScore(a)),
      profile,
      reflections,
      1.2
    );
  }
}

class EnergySaverStrategy {
  buildSchedule(tasks, profile, reflections) {
    return buildGapAwareSchedule(
      [...tasks].sort((a, b) => taskEnergyCost(a, profile) - taskEnergyCost(b, profile) || weightedUrgencyScore(b) - weightedUrgencyScore(a)),
      profile,
      reflections,
      0.9
    );
  }
}

class ScheduleManager {
  static instance;

  static getInstance() {
    if (!ScheduleManager.instance) {
      ScheduleManager.instance = new ScheduleManager();
    }

    return ScheduleManager.instance;
  }

  constructor() {
    this.tasks = [];
    this.sessions = [];
    this.reflections = [];
    this.profile = defaultProfile();
    this.strategy = new BalancedStrategy();
    this.lastPlan = null;
    this.calendar = [];
  }

  setProfile(profile) {
    this.profile = profile;
  }

  hydrate(state) {
    this.tasks = state.tasks || [];
    this.sessions = state.sessions || [];
    this.reflections = state.reflections || [];
    this.profile = state.profile || defaultProfile();
    this.lastPlan = state.lastPlan || null;
    this.calendar = state.calendar || [];
  }

  setStrategy(strategy) {
    this.strategy = strategy;
  }

  addTask(task) {
    this.tasks.push(task);
  }

  removeTask(taskId) {
    this.tasks = this.tasks.filter((task) => task.id !== taskId);
    this.sessions = this.sessions.filter((session) => session.taskId !== taskId);
  }

  addReflection(reflection) {
    this.reflections.unshift(reflection);
    this.reflections = this.reflections.slice(0, 30);
    this.sessions = this.sessions.map((session) =>
      session.id === reflection.sessionId
        ? {
            ...session,
            status: reflection.finished === "yes" ? "done" : "needs-adjustment",
            focusScore: reflection.focusScore
          }
        : session
    );
  }

  generatePlan() {
    const result = this.strategy.buildSchedule(this.tasks, this.profile, this.reflections);
    this.sessions = result.sessions;
    this.calendar = result.calendar;
    this.lastPlan = {
      nextBestTask: selectNextBestTask(this.tasks, this.profile),
      burnoutRisk: getBurnoutRisk(this.profile, this.tasks, this.reflections),
      crisis: buildCrisisPlan(this.tasks, this.profile),
      realitySummary: result.realitySummary
    };
    return this.sessions;
  }
}

class AddTaskCommand {
  constructor(manager, task, eventBus) {
    this.manager = manager;
    this.task = task;
    this.eventBus = eventBus;
  }

  execute() {
    this.manager.addTask(this.task);
    this.eventBus.publish("task:added", this.task);
  }

  undo() {
    this.manager.removeTask(this.task.id);
    this.eventBus.publish("task:removed", this.task);
  }
}

class CommandManager {
  constructor() {
    this.undoStack = [];
    this.redoStack = [];
  }

  execute(command) {
    command.execute();
    this.undoStack.push(command);
    this.redoStack = [];
  }

  undo() {
    const command = this.undoStack.pop();
    if (!command) {
      return false;
    }

    command.undo();
    this.redoStack.push(command);
    return true;
  }

  redo() {
    const command = this.redoStack.pop();
    if (!command) {
      return false;
    }

    command.execute();
    this.undoStack.push(command);
    return true;
  }
}

class ReminderService {
  constructor(eventBus) {
    this.messages = [];

    eventBus.subscribe("task:added", (task) => {
      this.push(`Added ${task.subject}: ${task.title}. The planner will now place it into real study gaps this week.`);
    });

    eventBus.subscribe("task:removed", (task) => {
      this.push(`Removed ${task.title}. Your calendar should have a little more breathing room.`);
    });

    eventBus.subscribe("profile:updated", (profile) => {
      this.push(`Reality layer updated. Sleep target is ${profile.sleepTarget}h, and the planner will now respect class, work, sports, and commute blocks.`);
    });

    eventBus.subscribe("plan:generated", (summary) => {
      if (!summary.nextBestTask) {
        this.push("No tasks yet. Add one meaningful deadline to generate a realistic weekly study map.");
        return;
      }

      this.push(`Next move: ${summary.nextBestTask.title}. ${summary.nextBestTask.reason}`);
    });

    eventBus.subscribe("reflection:logged", (reflection) => {
      if (reflection.finished === "yes" && reflection.focusScore >= 4) {
        this.push(`Strong session logged. Future plans can safely keep this level of intensity.`);
      } else if (reflection.tooHard === "yes") {
        this.push("That block was too hard, so the planner will break similar work into smaller sessions.");
      } else if (reflection.focusScore <= 2) {
        this.push("Focus was low, so the planner will prefer lighter or shorter blocks in crowded days.");
      } else {
        this.push("Reflection saved. The planner is using it to tune future sessions.");
      }
    });
  }

  push(message) {
    this.messages.unshift(message);
    this.messages = this.messages.slice(0, 8);
    renderReminders();
  }
}

class AiPlannerAssistant {
  summarize(tasks, profile, strategyName, plan) {
    if (!tasks.length) {
      return "Add tasks and I will build a gap-aware weekly schedule around your classes, work, sports, commute, and sleep target.";
    }

    const nearest = [...tasks].sort((a, b) => daysUntil(a.dueDate) - daysUntil(b.dueDate))[0];
    const next = plan.nextBestTask;
    const realityLine = plan.realitySummary;
    const coachLine = next
      ? `I am putting ${next.title} first because ${next.reason.toLowerCase()}`
      : "I need at least one task before I can choose your next move.";

    return `${strategyName} is active with ${tasks.length} task(s). ${realityLine} ${coachLine} The nearest deadline is ${nearest.title} in ${Math.max(daysUntil(nearest.dueDate), 0)} day(s).`;
  }
}

const eventBus = new EventBus();
const scheduleManager = ScheduleManager.getInstance();
const commandManager = new CommandManager();
const reminderService = new ReminderService(eventBus);
const aiPlannerAssistant = new AiPlannerAssistant();

const taskForm = document.querySelector("#task-form");
const profileForm = document.querySelector("#profile-form");
const strategySelect = document.querySelector("#strategy-select");
const taskList = document.querySelector("#task-list");
const scheduleList = document.querySelector("#schedule-list");
const reminderList = document.querySelector("#reminder-list");
const accountabilitySummary = document.querySelector("#accountability-summary");
const aiSummary = document.querySelector("#ai-summary");
const todayFocus = document.querySelector("#today-focus");
const upcomingCount = document.querySelector("#upcoming-count");
const plannerMode = document.querySelector("#planner-mode");
const readinessScore = document.querySelector("#readiness-score");
const nextBestTitle = document.querySelector("#next-best-title");
const nextBestReason = document.querySelector("#next-best-reason");
const crisisSummary = document.querySelector("#crisis-summary");
const completedCount = document.querySelector("#completed-count");
const streakCount = document.querySelector("#streak-count");
const confidenceScore = document.querySelector("#confidence-score");
const burnoutRisk = document.querySelector("#burnout-risk");
const calendarGrid = document.querySelector("#calendar-grid");

loadPlannerState();

profileForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(profileForm);
  const profile = {
    energyLevel: formData.get("energyLevel"),
    stressLevel: formData.get("stressLevel"),
    sleepHours: Number(formData.get("sleepHours")),
    sleepTarget: Number(formData.get("sleepTarget")),
    classHours: Number(formData.get("classHours")),
    sportsHours: Number(formData.get("sportsHours")),
    workHours: Number(formData.get("workHours")),
    commuteHours: Number(formData.get("commuteHours")),
    calendarPattern: formData.get("calendarPattern")
  };

  scheduleManager.setProfile(profile);
  eventBus.publish("profile:updated", profile);
  persistPlannerState();
  renderAll();
});

document.querySelector("#undo-btn").addEventListener("click", () => {
  commandManager.undo();
  persistPlannerState();
  renderAll();
});

document.querySelector("#redo-btn").addEventListener("click", () => {
  commandManager.redo();
  persistPlannerState();
  renderAll();
});

taskForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(taskForm);
  const rawTask = {
    id: crypto.randomUUID(),
    title: formData.get("title").trim(),
    subject: formData.get("subject").trim(),
    type: formData.get("type"),
    dueDate: formData.get("dueDate"),
    hours: Number(formData.get("hours")),
    difficulty: formData.get("difficulty"),
    confidence: Number(formData.get("confidence"))
  };

  let task = TaskFactory.createTask(rawTask);
  const priority = formData.get("priority");

  if (priority === "high") {
    task = new HighPriorityDecorator(task);
  }

  if (priority === "urgent") {
    task = new UrgentDecorator(task);
  }

  commandManager.execute(new AddTaskCommand(scheduleManager, task, eventBus));
  taskForm.reset();
  persistPlannerState();
  renderAll();
});

document.querySelector("#generate-plan-btn").addEventListener("click", () => {
  const strategyName = strategySelect.value;
  scheduleManager.setStrategy(createStrategy(strategyName));
  scheduleManager.generatePlan();

  const plan = scheduleManager.lastPlan;
  eventBus.publish("plan:generated", plan);
  aiSummary.textContent = aiPlannerAssistant.summarize(
    scheduleManager.tasks,
    scheduleManager.profile,
    labelForStrategy(strategyName),
    plan
  );

  persistPlannerState();
  renderAll();
});

scheduleList.addEventListener("click", (event) => {
  const action = event.target.dataset.action;
  const sessionId = event.target.dataset.sessionId;
  if (action !== "reflect" || !sessionId) {
    return;
  }

  const session = scheduleManager.sessions.find((item) => item.id === sessionId);
  if (!session) {
    return;
  }

  const finished = prompt("Did you finish it? Type yes or no.", "yes");
  if (!finished) {
    return;
  }

  const tooHard = prompt("Was it too hard? Type yes or no.", "no");
  if (!tooHard) {
    return;
  }

  const focusText = prompt("How focused were you? Enter 1 to 5.", "4");
  if (!focusText) {
    return;
  }

  const focusScore = Math.max(1, Math.min(5, Number(focusText) || 3));
  const reflection = {
    sessionId,
    title: session.title,
    finished: normalizeYesNo(finished),
    tooHard: normalizeYesNo(tooHard),
    focusScore,
    loggedAt: new Date().toISOString()
  };

  scheduleManager.addReflection(reflection);
  eventBus.publish("reflection:logged", reflection);

  if (scheduleManager.tasks.length) {
    scheduleManager.generatePlan();
    aiSummary.textContent = aiPlannerAssistant.summarize(
      scheduleManager.tasks,
      scheduleManager.profile,
      labelForStrategy(strategySelect.value),
      scheduleManager.lastPlan
    );
  }

  persistPlannerState();
  renderAll();
});

function createStrategy(strategyName) {
  const strategyMap = {
    balanced: new BalancedStrategy(),
    deadline: new DeadlineFirstStrategy(),
    energy: new EnergySaverStrategy()
  };

  return strategyMap[strategyName] || strategyMap.balanced;
}

function labelForStrategy(strategyName) {
  const labels = {
    balanced: "Balanced Strategy",
    deadline: "Deadline First",
    energy: "Energy Saver"
  };

  return labels[strategyName] || "Balanced Strategy";
}

function defaultProfile() {
  return {
    energyLevel: "medium",
    stressLevel: "medium",
    sleepHours: 7,
    sleepTarget: 8,
    classHours: 4,
    sportsHours: 1,
    workHours: 2,
    commuteHours: 0.5,
    calendarPattern: "balanced"
  };
}

function persistPlannerState() {
  const state = {
    tasks: scheduleManager.tasks.map(serializeTask),
    sessions: scheduleManager.sessions,
    reflections: scheduleManager.reflections,
    profile: scheduleManager.profile,
    lastPlan: scheduleManager.lastPlan,
    calendar: scheduleManager.calendar,
    strategyName: strategySelect?.value || "balanced"
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadPlannerState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    const hydratedTasks = (parsed.tasks || []).map(deserializeTask);
    scheduleManager.hydrate({
      tasks: hydratedTasks,
      sessions: parsed.sessions || [],
      reflections: parsed.reflections || [],
      profile: parsed.profile || defaultProfile(),
      lastPlan: parsed.lastPlan || null,
      calendar: parsed.calendar || []
    });

    if (parsed.strategyName) {
      strategySelect.value = parsed.strategyName;
      scheduleManager.setStrategy(createStrategy(parsed.strategyName));
    }

    if (scheduleManager.lastPlan) {
      aiSummary.textContent = aiPlannerAssistant.summarize(
        scheduleManager.tasks,
        scheduleManager.profile,
        labelForStrategy(strategySelect.value),
        scheduleManager.lastPlan
      );
    }
  } catch (error) {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function serializeTask(task) {
  let priorityLayer = "normal";
  let baseTask = task;

  if (task instanceof UrgentDecorator) {
    priorityLayer = "urgent";
    baseTask = task.task;
  } else if (task instanceof HighPriorityDecorator) {
    priorityLayer = "high";
    baseTask = task.task;
  }

  return {
    id: baseTask.id,
    title: baseTask.title,
    subject: baseTask.subject,
    dueDate: baseTask.dueDate,
    hours: baseTask.hours,
    difficulty: baseTask.difficulty,
    type: baseTask.type,
    confidence: baseTask.confidence,
    priorityLayer
  };
}

function deserializeTask(taskData) {
  let task = TaskFactory.createTask(taskData);

  if (taskData.priorityLayer === "high") {
    task = new HighPriorityDecorator(task);
  }

  if (taskData.priorityLayer === "urgent") {
    task = new UrgentDecorator(task);
  }

  return task;
}

function buildGapAwareSchedule(sortedTasks, profile, reflections, baseSessionLength) {
  const calendar = buildRealityCalendar(profile);
  const sessionLength = adjustedSessionLength(profile, baseSessionLength, reflections);
  const sessions = [];

  sortedTasks.forEach((task) => {
    let remaining = task.hours;
    const studyTypes = inferSessionTypes(task);
    const targetDays = calendar.filter((day) => day.date <= task.dueDate);

    targetDays.forEach((day) => {
      while (remaining > 0.2 && day.availableStudyHours > 0.4) {
        const planned = Number(Math.min(day.availableStudyHours, remaining, sessionLength).toFixed(1));
        if (planned < 0.5) {
          break;
        }

        const sessionIndex = sessions.filter((session) => session.taskId === task.id).length;
        const sessionType = studyTypes[Math.min(sessionIndex, studyTypes.length - 1)];
        const slotLabel = pickStudySlot(day);

        day.availableStudyHours = Number((day.availableStudyHours - planned).toFixed(1));
        remaining = Number((remaining - planned).toFixed(1));

        const session = {
          id: `${task.id}-${day.date}-${sessionIndex + 1}`,
          taskId: task.id,
          title: task.title,
          subject: task.subject,
          type: task.getLabel(),
          duration: planned,
          scheduledFor: day.date,
          slotLabel,
          energy: task.difficulty,
          sessionType,
          priorityScore: task.getPriorityScore(),
          status: "planned"
        };

        day.items.push({
          kind: "study",
          title: sessionType,
          subtitle: `${task.subject}: ${task.title}`,
          duration: `${planned}h in ${slotLabel}`
        });
        sessions.push(session);
      }
    });

    if (remaining > 0.2) {
      const overflowDate = task.dueDate;
      const crisisType = task.type === "project" ? "Project milestone sprint" : "Emergency catch-up review";
      sessions.push({
        id: `${task.id}-overflow`,
        taskId: task.id,
        title: task.title,
        subject: task.subject,
        type: task.getLabel(),
        duration: Number(remaining.toFixed(1)),
        scheduledFor: overflowDate,
        slotLabel: "overflow window",
        energy: task.difficulty,
        sessionType: crisisType,
        priorityScore: task.getPriorityScore() + 2,
        status: "planned"
      });

      const overflowDay = calendar.find((day) => day.date === overflowDate);
      if (overflowDay) {
        overflowDay.items.push({
          kind: "study",
          title: crisisType,
          subtitle: `${task.subject}: ${task.title}`,
          duration: `${Number(remaining.toFixed(1))}h in overflow window`
        });
      }
    }
  });

  return {
    sessions: sessions.sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor) || b.priorityScore - a.priorityScore),
    calendar,
    realitySummary: `I mapped your plan around a ${profile.calendarPattern.replace("-", " ")} calendar, preserving sleep, class, work, sports, and commute before placing study blocks into open gaps.`
  };
}

function buildRealityCalendar(profile) {
  return Array.from({ length: 7 }, (_, offset) => {
    const date = addDays(offset);
    const weekday = new Date(`${date}T00:00:00`).getDay();
    const pattern = getPatternMultipliers(profile.calendarPattern, weekday);
    const classHours = Number((profile.classHours * pattern.classMultiplier).toFixed(1));
    const sportsHours = Number((profile.sportsHours * pattern.sportsMultiplier).toFixed(1));
    const workHours = Number((profile.workHours * pattern.workMultiplier).toFixed(1));
    const commuteHours = Number((profile.commuteHours * pattern.commuteMultiplier).toFixed(1));
    const fixedLoad = classHours + sportsHours + workHours + commuteHours + profile.sleepTarget;
    const availableStudyHours = Number(Math.max(0.5, 24 - fixedLoad).toFixed(1));

    return {
      date,
      label: formatDayLabel(date),
      classHours,
      sportsHours,
      workHours,
      commuteHours,
      sleepTarget: profile.sleepTarget,
      availableStudyHours,
      items: [
        { kind: "fixed", title: "Sleep", subtitle: "Protected recovery", duration: `${profile.sleepTarget}h` },
        { kind: "fixed", title: "Classes", subtitle: "Course schedule", duration: `${classHours}h` },
        { kind: "fixed", title: "Work", subtitle: "Shift load", duration: `${workHours}h` },
        { kind: "fixed", title: "Sports", subtitle: "Training or activity", duration: `${sportsHours}h` },
        { kind: "fixed", title: "Commute", subtitle: "Travel buffer", duration: `${commuteHours}h` }
      ]
    };
  });
}

function getPatternMultipliers(pattern, weekday) {
  const isWeekend = weekday === 0 || weekday === 6;

  if (pattern === "packed") {
    return { classMultiplier: isWeekend ? 0.2 : 1.25, sportsMultiplier: isWeekend ? 0.6 : 1, workMultiplier: isWeekend ? 0.6 : 1, commuteMultiplier: isWeekend ? 0.5 : 1.1 };
  }

  if (pattern === "athlete") {
    return { classMultiplier: isWeekend ? 0.3 : 1, sportsMultiplier: isWeekend ? 1.6 : 1.4, workMultiplier: isWeekend ? 0.3 : 0.6, commuteMultiplier: isWeekend ? 0.5 : 1 };
  }

  if (pattern === "working-student") {
    return { classMultiplier: isWeekend ? 0.2 : 1, sportsMultiplier: isWeekend ? 0.4 : 0.6, workMultiplier: isWeekend ? 1.8 : 1.2, commuteMultiplier: isWeekend ? 1.1 : 1 };
  }

  return { classMultiplier: isWeekend ? 0.25 : 1, sportsMultiplier: isWeekend ? 0.8 : 1, workMultiplier: isWeekend ? 0.8 : 1, commuteMultiplier: isWeekend ? 0.7 : 1 };
}

function adjustedSessionLength(profile, baseSessionLength, reflections) {
  let modifier = 1;
  const recent = reflections.slice(0, 4);
  const lowFocusCount = recent.filter((item) => item.focusScore <= 2).length;
  const hardCount = recent.filter((item) => item.tooHard === "yes").length;

  if (profile.energyLevel === "low") {
    modifier -= 0.25;
  }

  if (profile.stressLevel === "high") {
    modifier -= 0.2;
  }

  if (profile.sleepHours < profile.sleepTarget - 1) {
    modifier -= 0.15;
  }

  if (lowFocusCount >= 2 || hardCount >= 2) {
    modifier -= 0.15;
  }

  if (profile.energyLevel === "high" && profile.stressLevel === "low" && lowFocusCount === 0) {
    modifier += 0.1;
  }

  return Number(Math.max(baseSessionLength * modifier, 0.6).toFixed(1));
}

function inferSessionTypes(task) {
  if (task.type === "exam") {
    return task.difficulty === "hard"
      ? ["Active recall", "Practice problems", "Flashcards"]
      : ["Flashcards", "Active recall"];
  }

  if (task.type === "project") {
    return ["Project milestone sprint", "Essay outlining", "Project milestone sprint"];
  }

  if (task.subject.toLowerCase().includes("english") || task.subject.toLowerCase().includes("history")) {
    return ["Essay outlining", "Active recall"];
  }

  return ["Practice problems", "Active recall", "Flashcards"];
}

function pickStudySlot(day) {
  if (day.workHours >= 4) {
    return "early study pocket";
  }

  if (day.classHours >= 5 || day.commuteHours >= 1) {
    return "evening recovery block";
  }

  if (day.sportsHours >= 2) {
    return "midday focus gap";
  }

  return "best open gap";
}

function selectNextBestTask(tasks, profile) {
  if (!tasks.length) {
    return null;
  }

  const ranked = [...tasks].sort((a, b) => weightedUrgencyScore(b) - weightedUrgencyScore(a));
  const best = ranked[0];
  const reasons = [];

  if (daysUntil(best.dueDate) <= 2) {
    reasons.push("the deadline is extremely close");
  }

  if (best.confidence <= 2) {
    reasons.push("your confidence is low here");
  }

  if (profile.energyLevel === "low" && best.type === "project") {
    reasons.push("small progress now will prevent a stressful crunch later");
  }

  if (!reasons.length) {
    reasons.push("it has the highest urgency-to-effort value in the queue");
  }

  return {
    title: `${best.subject}: ${best.title}`,
    reason: capitalize(reasons[0])
  };
}

function buildCrisisPlan(tasks, profile) {
  if (!tasks.length) {
    return {
      status: "stable",
      message: "No rescue plan needed yet."
    };
  }

  const overloaded = tasks.filter((task) => daysUntil(task.dueDate) <= 3);
  const totalUrgentHours = overloaded.reduce((sum, task) => sum + task.hours, 0);
  const capacity = Math.max(1, 24 - (profile.classHours + profile.workHours + profile.sportsHours + profile.commuteHours + profile.sleepTarget));
  const nextThreeDaysCapacity = capacity * 3;

  if (totalUrgentHours <= nextThreeDaysCapacity) {
    return {
      status: "stable",
      message: "You are tight but manageable. Protect the open gaps on your calendar and avoid adding low-value work."
    };
  }

  const primary = overloaded.sort((a, b) => weightedUrgencyScore(b) - weightedUrgencyScore(a))[0];
  return {
    status: "crisis",
    message: `Finish ${primary.title} first, compress lower-value work into minimum viable submissions, and reclaim time from optional commitments this week.`
  };
}

function weightedUrgencyScore(task) {
  const dueWeight = Math.max(1, 8 - Math.max(daysUntil(task.dueDate), 0));
  return task.getPriorityScore() * dueWeight;
}

function taskEnergyCost(task, profile) {
  const stressPenalty = profile.stressLevel === "high" ? 1 : 0;
  const confidencePenalty = task.confidence <= 2 ? 0.5 : 0;
  return task.hours + stressPenalty + confidencePenalty + (task.difficulty === "hard" ? 1 : 0);
}

function getBurnoutRisk(profile, tasks, reflections) {
  let score = 0;

  if (profile.energyLevel === "low") {
    score += 2;
  }

  if (profile.stressLevel === "high") {
    score += 2;
  }

  if (profile.sleepHours < profile.sleepTarget - 1) {
    score += 2;
  }

  if (profile.classHours + profile.workHours + profile.sportsHours >= 9) {
    score += 1;
  }

  if (tasks.filter((task) => daysUntil(task.dueDate) <= 3).length >= 3) {
    score += 2;
  }

  if (reflections.slice(0, 4).filter((item) => item.focusScore <= 2 || item.tooHard === "yes").length >= 2) {
    score += 1;
  }

  if (score >= 6) {
    return "High";
  }

  if (score >= 3) {
    return "Moderate";
  }

  return "Low";
}

function getProgressMetrics() {
  const reflections = scheduleManager.reflections;
  const completed = reflections.filter((item) => item.finished === "yes").length;
  const confidenceAverage = scheduleManager.tasks.length
    ? scheduleManager.tasks.reduce((sum, task) => sum + task.confidence, 0) / scheduleManager.tasks.length
    : 0;
  const averageFocus = reflections.length
    ? reflections.reduce((sum, reflection) => sum + reflection.focusScore, 0) / reflections.length
    : 0;
  const missed = reflections.filter((item) => item.finished === "no").length;
  const hard = reflections.filter((item) => item.tooHard === "yes").length;
  const readinessBase = completed * 8 + confidenceAverage * 10 + averageFocus * 7 - missed * 6 - hard * 4;
  const readiness = Math.max(0, Math.min(100, Math.round(readinessBase)));

  return {
    completed,
    streak: completed === 0 ? 0 : Math.min(completed, 7),
    readiness,
    confidence: Math.round((confidenceAverage / 5) * 100) || 0
  };
}

function buildAccountabilityText() {
  if (!scheduleManager.tasks.length) {
    return "No tasks added yet. Once tasks are entered, this area will summarize workload, risk, and recommended support actions.";
  }

  const metrics = getProgressMetrics();
  const urgentTasks = scheduleManager.tasks.filter((task) => daysUntil(task.dueDate) <= 3).length;
  const next = scheduleManager.lastPlan?.nextBestTask;
  const crisis = scheduleManager.lastPlan?.crisis?.message || "No crisis plan generated yet.";

  return `This student is tracking ${scheduleManager.tasks.length} task(s), with ${urgentTasks} due in the next three days. Readiness is ${metrics.readiness}% and burnout risk is ${getBurnoutRisk(scheduleManager.profile, scheduleManager.tasks, scheduleManager.reflections)}. The recommended immediate focus is ${next ? next.title : "not generated yet"}. The weekly calendar is being built around class, work, sports, commute, and sleep constraints before study sessions are placed. ${crisis}`;
}

function renderCalendar() {
  if (!scheduleManager.calendar.length) {
    calendarGrid.innerHTML = `<div class="empty-state">Generate a plan to see classes, work, commute, sports, sleep, and study blocks arranged across the week.</div>`;
    return;
  }

  calendarGrid.innerHTML = scheduleManager.calendar
    .map((day) => `
      <article class="calendar-day">
        <h3>${day.label}</h3>
        <div class="calendar-stack">
          ${day.items.map((item) => `
            <div class="calendar-chip ${item.kind}">
              <strong>${item.title}</strong>
              <span>${item.subtitle}</span>
              <span>${item.duration}</span>
            </div>
          `).join("")}
        </div>
      </article>
    `)
    .join("");
}

function renderTasks() {
  if (!scheduleManager.tasks.length) {
    taskList.innerHTML = `<div class="empty-state">No tasks yet. Add your first class task to start building an adaptive plan.</div>`;
    return;
  }

  taskList.innerHTML = scheduleManager.tasks
    .map((task) => {
      const dueSoon = daysUntil(task.dueDate) <= 2;
      const highPressure = task.getPriorityScore() >= 7;

      return `
        <article class="task-item">
          <strong>${task.subject}: ${task.title}</strong>
          <span>${task.getLabel()} due on ${task.dueDate}</span>
          <div class="task-meta">
            <span class="badge">${task.hours}h estimate</span>
            <span class="badge">${task.difficulty}</span>
            <span class="badge">confidence ${task.confidence}/5</span>
            ${dueSoon ? '<span class="badge warning">Due soon</span>' : ""}
            ${highPressure ? '<span class="badge urgent">High pressure</span>' : ""}
          </div>
        </article>
      `;
    })
    .join("");
}

function renderSessions() {
  if (!scheduleManager.sessions.length) {
    scheduleList.innerHTML = `<div class="empty-state">Generate a plan to see academically aware study sessions and reflection prompts.</div>`;
    return;
  }

  scheduleList.innerHTML = scheduleManager.sessions
    .map((session) => `
      <article class="session-item">
        <strong>${session.subject}: ${session.title}</strong>
        <span>${session.sessionType} on ${session.scheduledFor} during ${session.slotLabel}</span>
        <div class="session-meta">
          <span class="badge">${session.duration}h block</span>
          <span class="badge">${session.type}</span>
          <span class="badge">${session.energy} effort</span>
          ${session.status === "done" ? '<span class="badge success">Reflection says it worked</span>' : ""}
          ${session.status === "needs-adjustment" ? '<span class="badge warning">Needs a lighter retry</span>' : ""}
        </div>
        <div class="session-actions">
          <button class="mini-btn" data-action="reflect" data-session-id="${session.id}">Reflect On Session</button>
        </div>
      </article>
    `)
    .join("");
}

function renderReminders() {
  if (!reminderService.messages.length) {
    reminderList.innerHTML = `<div class="empty-state">Smart reminders will appear when tasks, plans, or reflections change.</div>`;
    return;
  }

  reminderList.innerHTML = reminderService.messages
    .map((message) => `
      <article class="reminder-item">
        <strong>Planner Update</strong>
        <span>${message}</span>
      </article>
    `)
    .join("");
}

function renderInsights() {
  const plan = scheduleManager.lastPlan;
  const metrics = getProgressMetrics();
  const next = plan?.nextBestTask;
  const crisis = plan?.crisis;

  plannerMode.textContent = labelForStrategy(strategySelect.value);
  readinessScore.textContent = `${metrics.readiness}%`;
  completedCount.textContent = `${metrics.completed}`;
  streakCount.textContent = `${metrics.streak} day${metrics.streak === 1 ? "" : "s"}`;
  confidenceScore.textContent = `${metrics.confidence}%`;
  burnoutRisk.textContent = getBurnoutRisk(scheduleManager.profile, scheduleManager.tasks, scheduleManager.reflections);
  upcomingCount.textContent = `${metrics.completed} win${metrics.completed === 1 ? "" : "s"} tracked`;

  if (next) {
    todayFocus.textContent = next.title;
    nextBestTitle.textContent = next.title;
    nextBestReason.textContent = next.reason;
  } else {
    todayFocus.textContent = "Generate a plan to get your first move";
    nextBestTitle.textContent = "Nothing selected yet";
    nextBestReason.textContent = "Add tasks and generate a plan to see the smartest next move.";
  }

  crisisSummary.textContent = crisis ? crisis.message : "No rescue plan needed yet.";
  accountabilitySummary.textContent = buildAccountabilityText();
}

function renderAll() {
  renderCalendar();
  renderTasks();
  renderSessions();
  renderReminders();
  renderInsights();
}

function daysUntil(dateString) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${dateString}T00:00:00`);
  const diff = due.getTime() - today.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function addDays(days) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDayLabel(dateString) {
  return new Date(`${dateString}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric"
  });
}

function normalizeYesNo(value) {
  return value.toLowerCase().trim().startsWith("y") ? "yes" : "no";
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

renderAll();
