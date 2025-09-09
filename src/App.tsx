// @ts-nocheck
// Aplikasi Akunting Ruang Belajar — versi Online (Multi-user)
// Stack: React (Vite) + Supabase (Postgres + Realtime)
// — Simpan sebagai src/App.jsx dalam proyek Vite React
// — Install: npm i @supabase/supabase-js
// — Pastikan environment Vite:
//    VITE_SUPABASE_URL=...
//    VITE_SUPABASE_ANON_KEY=...

import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

console.log("VITE_SUPABASE_URL =", import.meta.env.VITE_SUPABASE_URL);

// ====== ENV & Client ======
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const sb = createClient(supabaseUrl, supabaseKey);

// ====== Helpers ======
const fmtIDR = (n) =>
  n || n === 0
    ? n.toLocaleString("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0,
      })
    : "-";
const todayISO = () => new Date().toISOString().slice(0, 10);

const getWeekRange = (baseDateStr) => {
  const d = baseDateStr ? new Date(baseDateStr) : new Date();
  const day = d.getDay();
  const diffToMonday = (day === 0 ? -6 : 1) - day;
  const start = new Date(d);
  start.setDate(d.getDate() + diffToMonday);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  const label = `${start.toLocaleDateString("id-ID")} – ${end.toLocaleDateString("id-ID")}`;
  const key = `${start.toISOString().slice(0, 10)}_${end.toISOString().slice(0, 10)}`;
  return { start, end, label, key };
};

const within = (dateStr, start, end) => {
  const t = new Date(dateStr).getTime();
  return t >= start.getTime() && t <= end.getTime();
};

// ====== SQL (jalankan di Supabase SQL editor):
// (lihat blok SQL di versi kamu sebelumnya — tetap sama)

// ====== Util Cetak (stabil, tidak about:blank)
function printHtmlString(html, title = "Cetak") {
  const w = window.open("", "_blank", "noopener,noreferrer");
  if (!w) {
    alert("Popup diblokir. Izinkan popup untuk situs ini agar bisa mencetak.");
    return;
  }
  w.document.open();
  w.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    *{ box-sizing: border-box; font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; }
    body{ margin:20px; color:#111; }
    h1,h2,h3{ margin:0 0 8px 0; }
    table{ width:100%; border-collapse: collapse; margin-top:12px; }
    th, td{ border:1px solid #ccc; padding:8px; font-size: 12px; }
    th{ background:#f4f4f4; text-align:left; }
    .meta{ margin-bottom:12px; font-size: 12px; }
    .right{ text-align:right; }
    .muted{ color:#666; font-size:12px; }
    .total{ font-weight:700; }
    @media print {
      @page { margin: 16mm; }
      .no-print { display:none !important; }
    }
  </style>
</head>
<body>
${html}
</body>
</html>`);
  w.document.close();
  w.onload = () => {
    w.focus();
    w.print();
    w.close();
  };
}

export default function App() {
  const [weekDate, setWeekDate] = useState(todayISO());
  const { start, end, label: weekLabel, key: weekKey } = useMemo(
    () => getWeekRange(weekDate),
    [weekDate]
  );

  // test ping
  useEffect(() => {
    (async () => {
      const { data, error } = await sb.from("classes").select("*").limit(1);
      console.log("Ping Supabase classes:", { data, error });
    })();
  }, []);

  // data state
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [payments, setPayments] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // initial load
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const [
          { data: c, error: ec },
          { data: s, error: es },
          { data: p, error: ep },
          { data: e, error: ee },
        ] = await Promise.all([
          sb.from("classes").select("*").order("created_at", { ascending: true }),
          sb.from("students").select("*").order("created_at", { ascending: true }),
          sb.from("payments").select("*").order("created_at", { ascending: true }),
          sb.from("expenses").select("*").order("created_at", { ascending: true }),
        ]);
        if (ec || es || ep || ee) throw ec || es || ep || ee;
        setClasses(c || []);
        setStudents(s || []);
        setPayments(p || []);
        setExpenses(e || []);
      } catch (e) {
        setErr(e.message || String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // realtime (optional)
  useEffect(() => {
    const ch = sb
      .channel("realtime-akunting")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "classes" },
        () => refresh("classes")
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "students" },
        () => refresh("students")
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "payments" },
        () => refresh("payments")
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "expenses" },
        () => refresh("expenses")
      )
      .subscribe();
    return () => {
      sb.removeChannel(ch);
    };
  }, []);

  async function refresh(kind) {
    if (kind === "classes") {
      const { data } = await sb.from("classes").select("*").order("created_at");
      setClasses(data || []);
    } else if (kind === "students") {
      const { data } = await sb.from("students").select("*").order("created_at");
      setStudents(data || []);
    } else if (kind === "payments") {
      const { data } = await sb.from("payments").select("*").order("created_at");
      setPayments(data || []);
    } else if (kind === "expenses") {
      const { data } = await sb.from("expenses").select("*").order("created_at");
      setExpenses(data || []);
    }
  }

  // derived
  const dueForStudentThisWeek = (s) =>
    Math.max(0, (s.fee_per_week || 0) - (s.mukafaah_per_week || 0));

  const paidByStudentThisWeek = (sid) =>
    payments
      .filter((p) => p.student_id === sid && within(p.date, start, end))
      .reduce((a, b) => a + (b.amount || 0), 0);

  const weeklyExpected = useMemo(
    () => students.filter((s) => s.active).reduce((sum, s) => sum + dueForStudentThisWeek(s), 0),
    [students, weekKey]
  );
  const weeklyPayments = useMemo(
    () => payments.filter((p) => within(p.date, start, end)).reduce((sum, p) => sum + (p.amount || 0), 0),
    [payments, weekKey]
  );
  const weeklyExpenses = useMemo(
    () => expenses.filter((e) => within(e.date, start, end)).reduce((sum, e) => sum + (e.amount || 0), 0),
    [expenses, weekKey]
  );
  const weeklyNet = useMemo(
    () => weeklyPayments - weeklyExpenses,
    [weeklyPayments, weeklyExpenses]
  );

  // CRUD
  async function addClass(name) {
    if (!name?.trim()) return;
    await sb.from("classes").insert({ name: name.trim() });
  }
  async function deleteClass(id) {
    await sb.from("classes").delete().eq("id", id);
  }

  async function addStudent(payload) {
    await sb.from("students").insert({
      name: payload.name,
      class_id: payload.classId || null,
      fee_per_week: payload.feePerWeek || 0,
      mukafaah_per_week: payload.mukafaahPerWeek || 0,
      active: payload.active ?? true,
    });
  }
  async function updateStudent(id, patch) {
    const mapped = {};
    if ("name" in patch) mapped.name = patch.name;
    if ("classId" in patch) mapped.class_id = patch.classId || null;
    if ("feePerWeek" in patch) mapped.fee_per_week = patch.feePerWeek;
    if ("mukafaahPerWeek" in patch) mapped.mukafaah_per_week = patch.mukafaahPerWeek;
    if ("active" in patch) mapped.active = patch.active;
    await sb.from("students").update(mapped).eq("id", id);
  }
  async function deleteStudent(id) {
    await sb.from("students").delete().eq("id", id);
  }

  async function addPayment(payload) {
    await sb.from("payments").insert({
      student_id: payload.studentId,
      date: payload.date,
      amount: payload.amount,
      note: payload.note || null,
    });
  }
  async function deletePayment(id) {
    await sb.from("payments").delete().eq("id", id);
  }

  async function addExpense(payload) {
    await sb.from("expenses").insert({
      date: payload.date,
      category: payload.category || null,
      amount: payload.amount,
      note: payload.note || null,
    });
  }
  async function deleteExpense(id) {
    await sb.from("expenses").delete().eq("id", id);
  }

  if (!supabaseUrl || !supabaseKey) {
    return (
      <div style={{ padding: 16 }}>
        ❗Konfigurasi Supabase belum diisi. Tambahkan VITE_SUPABASE_URL dan
        VITE_SUPABASE_ANON_KEY di .env.local
      </div>
    );
  }

  return (
    <div style={{ padding: 16, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>
        Akunting Ruang Belajar — Online (Supabase)
      </h1>
      <p style={{ color: "#555" }}>
        Multi-kelas • Tagihan mingguan • Mukafaah • Invoice & Kwitansi •
        Pengeluaran • Realtime
      </p>

      {err && (
        <div
          style={{
            background: "#fee2e2",
            padding: 8,
            borderRadius: 8,
            marginTop: 8,
          }}
        >
          Error: {err}
        </div>
      )}

      {/* Periode */}
      <section
        style={{
          marginTop: 16,
          padding: 12,
          background: "#fff",
          borderRadius: 12,
          boxShadow: "0 1px 3px rgba(0,0,0,.08)",
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>Periode Mingguan</h2>
        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
            marginTop: 8,
          }}
        >
          <label>
            Tanggal acuan:{" "}
            <input
              type="date"
              value={weekDate}
              onChange={(e) => setWeekDate(e.target.value)}
            />
          </label>
          <div style={{ color: "#666" }}>
            Periode: <b>{weekLabel}</b>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 16 }}>
            <div>
              Tagihan: <b>{fmtIDR(weeklyExpected)}</b>
            </div>
            <div>
              Terbayar: <b style={{ color: "#15803d" }}>{fmtIDR(weeklyPayments)}</b>
            </div>
            <div>
              Pengeluaran:{" "}
              <b style={{ color: "#b91c1c" }}>{fmtIDR(weeklyExpenses)}</b>
            </div>
            <div>
              Netto: <b>{fmtIDR(weeklyNet)}</b>
            </div>
          </div>
        </div>
      </section>

      {/* KELAS & SISWA */}
      <section
        style={{
          marginTop: 16,
          display: "grid",
          gridTemplateColumns: "1fr 2fr",
          gap: 16,
        }}
      >
        <div
          style={{
            background: "#fff",
            borderRadius: 12,
            padding: 12,
            boxShadow: "0 1px 3px rgba(0,0,0,.08)",
          }}
        >
          <h3 style={{ fontWeight: 600 }}>Kelola Kelas</h3>
          <AddClass onAdd={addClass} />
          <div style={{ marginTop: 8 }}>
            {classes.map((c) => (
              <div
                key={c.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: 8,
                  border: "1px solid #eee",
                  borderRadius: 8,
                  marginBottom: 6,
                }}
              >
                <div>{c.name}</div>
                <button onClick={() => deleteClass(c.id)} style={{ color: "#b91c1c" }}>
                  Hapus
                </button>
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            background: "#fff",
            borderRadius: 12,
            padding: 12,
            boxShadow: "0 1px 3px rgba(0,0,0,.08)",
          }}
        >
          <h3 style={{ fontWeight: 600 }}>Kelola Siswa</h3>
          <AddStudent onAdd={addStudent} classes={classes} />
          <div style={{ marginTop: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ borderBottom: "1px solid #eee", textAlign: "left" }}>
                    Nama
                  </th>
                  <th style={{ borderBottom: "1px solid #eee" }}>Kelas</th>
                  <th style={{ borderBottom: "1px solid #eee" }}>Biaya/Minggu</th>
                  <th style={{ borderBottom: "1px solid #eee" }}>Mukafaah</th>
                  <th style={{ borderBottom: "1px solid #eee" }}>Aktif</th>
                  <th style={{ borderBottom: "1px solid #eee" }} />
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.id}>
                    <td style={{ padding: 6 }}>
                      <input
                        value={s.name}
                        onChange={(e) => updateStudent(s.id, { name: e.target.value })}
                      />
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <select
                        value={s.class_id || "-"}
                        onChange={(e) =>
                          updateStudent(s.id, {
                            classId: e.target.value === "-" ? null : e.target.value,
                          })
                        }
                      >
                        <option value="-">(None)</option>
                        {classes.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <input
                        type="number"
                        value={s.fee_per_week || 0}
                        onChange={(e) =>
                          updateStudent(s.id, {
                            feePerWeek: Number(e.target.value || 0),
                          })
                        }
                        style={{ width: 120 }}
                      />
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <input
                        type="number"
                        value={s.mukafaah_per_week || 0}
                        onChange={(e) =>
                          updateStudent(s.id, {
                            mukafaahPerWeek: Number(e.target.value || 0),
                          })
                        }
                        style={{ width: 120 }}
                      />
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={!!s.active}
                        onChange={(e) => updateStudent(s.id, { active: e.target.checked })}
                      />
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <button onClick={() => deleteStudent(s.id)} style={{ color: "#b91c1c" }}>
                        Hapus
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* PEMBAYARAN & PENGELUARAN */}
      <section
        style={{
          marginTop: 16,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
        }}
      >
        <div
          style={{
            background: "#fff",
            borderRadius: 12,
            padding: 12,
            boxShadow: "0 1px 3px rgba(0,0,0,.08)",
          }}
        >
          <h3 style={{ fontWeight: 600 }}>Catat Pembayaran</h3>
          <AddPayment onAdd={addPayment} students={students} />
          <div style={{ marginTop: 8 }}>
            {payments
              .filter((p) => within(p.date, start, end))
              .map((p) => {
                const st = students.find((x) => x.id === p.student_id);
                return (
                  <div
                    key={p.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      border: "1px solid #eee",
                      borderRadius: 8,
                      padding: 8,
                      marginBottom: 6,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600 }}>{st?.name || "(Siswa)"}</div>
                      <div style={{ color: "#666", fontSize: 13 }}>
                        {new Date(p.date).toLocaleDateString("id-ID")} • {p.note || "-"}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <div style={{ fontWeight: 700 }}>{fmtIDR(p.amount)}</div>
                      <button onClick={() => deletePayment(p.id)} style={{ color: "#b91c1c" }}>
                        Hapus
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        <div
          style={{
            background: "#fff",
            borderRadius: 12,
            padding: 12,
            boxShadow: "0 1px 3px rgba(0,0,0,.08)",
          }}
        >
          <h3 style={{ fontWeight: 600 }}>Catat Pengeluaran</h3>
          <AddExpense onAdd={addExpense} />
          <div style={{ marginTop: 8 }}>
            {expenses
              .filter((e) => within(e.date, start, end))
              .map((e) => (
                <div
                  key={e.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    border: "1px solid #eee",
                    borderRadius: 8,
                    padding: 8,
                    marginBottom: 6,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>{e.category || "Lainnya"}</div>
                    <div style={{ color: "#666", fontSize: 13 }}>
                      {new Date(e.date).toLocaleDateString("id-ID")} • {e.note || "-"}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{ fontWeight: 700 }}>{fmtIDR(e.amount)}</div>
                    <button onClick={() => deleteExpense(e.id)} style={{ color: "#b91c1c" }}>
                      Hapus
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </section>

      {/* INVOICE & RECEIPT */}
      <section
        style={{
          marginTop: 16,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
        }}
      >
        <div
          style={{
            background: "#fff",
            borderRadius: 12,
            padding: 12,
            boxShadow: "0 1px 3px rgba(0,0,0,.08)",
          }}
        >
          <h3 style={{ fontWeight: 600 }}>Form Tagihan (Invoice)</h3>
          <Invoice
            students={students}
            start={start}
            end={end}
            dueFor={dueForStudentThisWeek}
            paidBy={paidByStudentThisWeek}
          />
        </div>

        <div
          style={{
            background: "#fff",
            borderRadius: 12,
            padding: 12,
            boxShadow: "0 1px 3px rgba(0,0,0,.08)",
          }}
        >
          <h3 style={{ fontWeight: 600 }}>Kwitansi (Receipt)</h3>
          <Receipt students={students} payments={payments} />
        </div>
      </section>

      {loading && <div style={{ marginTop: 10, color: "#666" }}>Memuat data…</div>}
    </div>
  );
}

/* ====================== Subcomponents ====================== */

function AddClass({ onAdd }) {
  const [name, setName] = useState("");
  return (
    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
      <input
        placeholder="Nama kelas"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <button
        onClick={() => {
          onAdd(name);
          setName("");
        }}
      >
        Tambah
      </button>
    </div>
  );
}

function AddStudent({ onAdd, classes }) {
  const [name, setName] = useState("");
  const [classId, setClassId] = useState("-");
  const [fee, setFee] = useState(200000);
  const [mukafaah, setMukafaah] = useState(0);
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "2fr 1fr 1fr 1fr auto",
        gap: 8,
        marginTop: 8,
      }}
    >
      <input
        placeholder="Nama siswa"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <select value={classId} onChange={(e) => setClassId(e.target.value)}>
        <option value="-">(None)</option>
        {classes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <input
        type="number"
        value={fee}
        onChange={(e) => setFee(Number(e.target.value || 0))}
      />
      <input
        type="number"
        value={mukafaah}
        onChange={(e) => setMukafaah(Number(e.target.value || 0))}
      />
      <button
        onClick={() => {
          if (!name.trim()) return;
          onAdd({
            name: name.trim(),
            classId: classId === "-" ? null : classId,
            feePerWeek: fee,
            mukafaahPerWeek: mukafaah,
          });
          setName("");
          setClassId("-");
          setFee(200000);
          setMukafaah(0);
        }}
      >
        Tambah Siswa
      </button>
    </div>
  );
}

function AddPayment({ onAdd, students }) {
  const [studentId, setStudentId] = useState(students[0]?.id || "");
  const [date, setDate] = useState(todayISO());
  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState("");
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr auto",
        gap: 8,
        marginTop: 8,
      }}
    >
      <select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
        {students.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <input
        type="number"
        value={amount}
        onChange={(e) => setAmount(Number(e.target.value || 0))}
      />
      <input
        placeholder="Catatan (opsional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <button
        onClick={() => {
          if (!studentId || !amount) return;
          onAdd({ studentId, date, amount, note });
          setAmount(0);
          setNote("");
        }}
      >
        Simpan
      </button>
    </div>
  );
}

function AddExpense({ onAdd }) {
  const [date, setDate] = useState(todayISO());
  const [category, setCategory] = useState("Operasional");
  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState("");
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr 1fr auto",
        gap: 8,
        marginTop: 8,
      }}
    >
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <input
        placeholder="Kategori"
        value={category}
        onChange={(e) => setCategory(e.target.value)}
      />
      <input
        type="number"
        value={amount}
        onChange={(e) => setAmount(Number(e.target.value || 0))}
      />
      <input
        placeholder="Catatan"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <button
        onClick={() => {
          if (!amount) return;
          onAdd({ date, category, amount, note });
          setAmount(0);
          setNote("");
        }}
      >
        Simpan
      </button>
    </div>
  );
}

/* ============= CETAK INVOICE & KWITANSI (langsung via printHtmlString) ============= */

function Invoice({ students, start, end, dueFor, paidBy }) {
  const [sid, setSid] = useState(students[0]?.id || "");
  const s = students.find((x) => x.id === sid);
  const due = s ? dueFor(s) : 0;
  const paid = s ? paidBy(s.id) : 0;
  const outstanding = Math.max(0, due - paid);

  function handlePrint() {
    if (!s) return alert("Pilih siswa dulu.");
    const html = `
      <h2>INVOICE / TAGIHAN</h2>
      <div class="meta">
        <div><b>Nama Siswa:</b> ${s.name}</div>
        <div><b>Periode:</b> ${start.toLocaleDateString("id-ID")} – ${end.toLocaleDateString("id-ID")}</div>
        <div class="muted">Dicetak: ${new Date().toLocaleString("id-ID")}</div>
      </div>
      <table>
        <tr><th>Komponen</th><th class="right">Nominal</th></tr>
        <tr><td>Biaya Mingguan</td><td class="right">${fmtIDR(s.fee_per_week||0)}</td></tr>
        <tr><td>Potongan Mukafaah</td><td class="right">− ${fmtIDR(s.mukafaah_per_week||0)}</td></tr>
        <tr><td class="total">Total Tagihan</td><td class="right total">${fmtIDR(due)}</td></tr>
        <tr><td>Pembayaran (minggu ini)</td><td class="right">${fmtIDR(paid)}</td></tr>
        <tr><td class="total">Sisa</td><td class="right total">${fmtIDR(outstanding)}</td></tr>
      </table>
      <p class="muted" style="margin-top:10px">Mohon lakukan pembayaran sesuai sisa tagihan. Terima kasih.</p>
    `;
    printHtmlString(html, `Invoice - ${s.name}`);
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "2fr auto", gap: 8, alignItems: "end", marginTop: 8 }}>
      <select value={sid} onChange={(e) => setSid(e.target.value)}>
        {students.map((st) => (
          <option key={st.id} value={st.id}>
            {st.name}
          </option>
        ))}
      </select>
      <button onClick={handlePrint} disabled={!s}>
        Cetak Invoice
      </button>
    </div>
  );
}

function Receipt({ students, payments }) {
  const [pid, setPid] = useState(payments[0]?.id || "");
  const p = payments.find((x) => x.id === pid);
  const s = students.find((x) => x.id === p?.student_id);

  function handlePrint() {
    if (!p) return alert("Pilih pembayaran dulu.");
    const html = `
      <h2>KWITANSI PEMBAYARAN</h2>
      <div class="meta">
        <div><b>Diterima dari:</b> ${s?.name ?? "-"}</div>
        <div><b>Tanggal:</b> ${new Date(p.date).toLocaleDateString("id-ID")}</div>
        <div><b>Catatan:</b> ${p.note ?? "-"}</div>
      </div>
      <table>
        <tr><td>Jumlah</td><td class="right">${fmtIDR(p.amount||0)}</td></tr>
      </table>
      <p class="muted" style="margin-top:10px">Terima kasih.</p>
    `;
    printHtmlString(html, `Kwitansi - ${s?.name ?? ""}`);
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "2fr auto", gap: 8, alignItems: "end", marginTop: 8 }}>
      <select value={pid} onChange={(e) => setPid(e.target.value)}>
        {payments.map((pp) => {
          const st = students.find((x) => x.id === pp.student_id);
          return (
            <option key={pp.id} value={pp.id}>
              {st?.name || "(Siswa)"} • {new Date(pp.date).toLocaleDateString("id-ID")} • {fmtIDR(pp.amount)}
            </option>
          );
        })}
      </select>
      <button onClick={handlePrint} disabled={!p}>
        Cetak Kwitansi
      </button>
    </div>
  );
}
