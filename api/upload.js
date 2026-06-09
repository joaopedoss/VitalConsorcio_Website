/**
 * api/upload.js — Vital Consórcio (Vercel Serverless Function)
 * Usa Supabase Storage — arquivos com nome e extensão corretos.
 *
 * ══════════════════════════════════════════════════════════════
 *  Variáveis de ambiente na Vercel (Settings → Environment Variables):

 * ══════════════════════════════════════════════════════════════
 */

import { IncomingForm } from 'formidable';
import { readFileSync } from 'fs';

export const config = { api: { bodyParser: false } };

function jsonErr(res, status, msg) {
  res.status(status).json({ sucesso: false, erro: msg });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return jsonErr(res, 405, 'Método não permitido.');

  const supabaseUrl = process.env.SUPABASE_URL;
  const secretKey   = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !secretKey) {
    return jsonErr(res, 500, 'Variáveis de ambiente Supabase não configuradas.');
  }

  const form = new IncomingForm({ maxFileSize: 10 * 1024 * 1024 });

  form.parse(req, async (err, _fields, files) => {
    if (err) return jsonErr(res, 400, 'Erro ao processar arquivo: ' + err.message);

    const file = Array.isArray(files.arquivo) ? files.arquivo[0] : files.arquivo;
    if (!file) return jsonErr(res, 400, 'Nenhum arquivo enviado.');

    const tiposPermitidos = {
      'application/pdf':       'pdf',
      'image/jpeg':            'jpg',
      'image/png':             'png',
      'application/msword':    'doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    };

    if (!tiposPermitidos[file.mimetype]) {
      return jsonErr(res, 400, 'Tipo não permitido. Use PDF, JPG, PNG ou DOCX.');
    }

    try {
      const fileBuffer   = readFileSync(file.filepath);
      const originalName = (file.originalFilename || 'arquivo').replace(/[^a-zA-Z0-9._-]/g, '_');
      const timestamp    = Date.now();
      const fileName     = `${timestamp}_${originalName}`;

      /* Upload para Supabase Storage no bucket 'uploads' */
      const uploadRes = await fetch(
        `${supabaseUrl}/storage/v1/object/uploads/${fileName}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${secretKey}`,
            'Content-Type':  file.mimetype,
            'x-upsert':      'true',
          },
          body: fileBuffer,
        }
      );

      if (!uploadRes.ok) {
        const errData = await uploadRes.json().catch(() => ({}));
        throw new Error('Supabase: ' + (errData.message || uploadRes.statusText));
      }

      /* URL pública do arquivo */
      const publicUrl = `${supabaseUrl}/storage/v1/object/public/uploads/${fileName}`;

      res.status(200).json({ sucesso: true, link: publicUrl });

    } catch (e) {
      jsonErr(res, 500, e.message);
    }
  });
}
