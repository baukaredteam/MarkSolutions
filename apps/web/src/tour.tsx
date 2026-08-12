import { useState } from "react";
import { useNavigate } from "react-router-dom";

const TOUR = [
  {
    title: "Добро пожаловать в MarkFlow",
    text: "Главная показывает сквозной процесс маркировки, KPI, задачи и исключения.",
    route: "/dashboard",
  },
  {
    title: "Центр задач",
    text: "Все действия из разных модулей собраны в единой очереди с приоритетами и SLA.",
    route: "/tasks",
  },
  {
    title: "Центр исключений",
    text: "Ошибки не теряются в отдельных разделах: здесь единая диагностика и эскалация.",
    route: "/exceptions",
  },
  {
    title: "Конструктор процессов",
    text: "Маршруты согласования, проверки и уведомления можно настраивать без изменения кода.",
    route: "/processes",
  },
  {
    title: "Состояние платформы",
    text: "Мониторинг сервисов и внешних зависимостей помогает поддерживать промышленную эксплуатацию.",
    route: "/health",
  },
];

export function TourTip() {
  const nav = useNavigate();
  const [idx, setIdx] = useState(0);
  const done = sessionStorage.getItem("mfTourDone") === "1";
  const [show, setShow] = useState(!done);

  if (!show) return null;
  const step = TOUR[idx];

  function next() {
    if (idx + 1 >= TOUR.length) {
      sessionStorage.setItem("mfTourDone", "1");
      setShow(false);
      nav("/dashboard");
      return;
    }
    const n = idx + 1;
    setIdx(n);
    nav(TOUR[n].route);
  }
  function close() {
    sessionStorage.setItem("mfTourDone", "1");
    setShow(false);
  }

  return (
    <div className="tour-tip show">
      <h3>{step.title}</h3>
      <p>{step.text}</p>
      <div className="tour-actions">
        <span>
          {idx + 1} / {TOUR.length}
        </span>
        <div>
          <button onClick={close}>Закрыть</button>{" "}
          <button onClick={next}>Далее</button>
        </div>
      </div>
    </div>
  );
}
