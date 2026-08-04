import Agenda from "agenda";
import config from "./env.js";

const agenda = new Agenda({
  db: {
    address: config.mongoUri,
    collection: "agendaJobs",
  },
  maxConcurrency: 20,
  defaultConcurrency: 5,
});

// Log job failures without letting uncaught errors crash the application process
agenda.on("fail", (err, job) => {
  console.error(
    `[agenda] Job "${job.attrs.name}" (ID: ${job.attrs._id}) failed:`,
    err.message,
  );
});

agenda.on("error", (err) => {
  console.error("[agenda] Connection/internal error:", err.message);
});

export default agenda;
