"use client";
import { useState } from "react";

export default function Upload() {
  const [file, setFile] = useState<File | null>(null);
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    await fetch("http://localhost:8787/api/upload/syllabus", { method: "POST", body: fd });
    alert("Uploaded (check Supabase bucket 'syllabi').");
  }
  return (
    <main className="p-6">
      <h1 className="text-xl font-semibold mb-4">Syllabus Upload</h1>
      <form onSubmit={onSubmit} className="space-x-2">
        <input type="file" accept="application/pdf" onChange={(e)=>setFile(e.target.files?.[0]||null)} />
        <button type="submit" className="border px-3 py-1 rounded">Upload</button>
      </form>
    </main>
  );
}
