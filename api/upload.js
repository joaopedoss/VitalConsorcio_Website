/**
 * api/upload.js — Vital Consórcio (Vercel Serverless Function)
 * Usa Cloudinary para armazenar arquivos — gratuito, sem Google Drive.
 *
 * ══════════════════════════════════════════════════════════════
 *  CONFIGURAÇÃO — adicione estas variáveis na Vercel:
 *  Settings → Environment Variables
 *
 *  CLOUDINARY_CLOUD_NAME  → seu cloud name (ex: dxyz1234)
 *  CLOUDINARY_API_KEY     → API Key
 *  CLOUDINARY_API_SECRET  → API Secret
 * ══════════════════════════════════════════════════════════════
 */

import { IncomingForm } from 'formidable';
import { readFileSync } from 'fs';
import { createHash, createHmac } from 'crypto';

export const config = { api: { bodyParser: false } };

function jsonErr(res, status, msg) {
  res.status(status).json({ sucesso: false, erro: msg });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return jsonErr(res, 405, 'Método não permitido.');

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey    = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    return jsonErr(res, 500, 'Variáveis de ambiente Cloudinary não configuradas.');
  }

  /* Parse multipart */
  const form = new IncomingForm({ maxFileSize: 10 * 1024 * 1024 });

  form.parse(req, async (err, _fields, files) => {
    if (err) return jsonErr(res, 400, 'Erro ao processar arquivo: ' + err.message);

    const file = Array.isArray(files.arquivo) ? files.arquivo[0] : files.arquivo;
    if (!file) return jsonErr(res, 400, 'Nenhum arquivo enviado.');

    const tiposPermitidos = [
      'application/pdf', 'image/jpeg', 'image/png',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    if (!tiposPermitidos.includes(file.mimetype)) {
      return jsonErr(res, 400, 'Tipo não permitido. Use PDF, JPG, PNG ou DOCX.');
    }

    try {
      const fileBuffer = readFileSync(file.filepath);
      const b64        = fileBuffer.toString('base64');
      const dataUri    = `data:${file.mimetype};base64,${b64}`;
      const timestamp  = Math.floor(Date.now() / 1000).toString();
      const folder     = 'vital-consorcio';

      /* Nome original sem caracteres inválidos */
      const originalName = (file.originalFilename || 'arquivo').replace(/[^a-zA-Z0-9._-]/g, '_');

      /* Assina a requisição */
      const toSign    = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
      const signature = createHash('sha1').update(toSign).digest('hex');

      /* Monta form data para Cloudinary */
      const formData = new FormData();
      formData.append('file',       dataUri);
      formData.append('api_key',    apiKey);
      formData.append('timestamp',  timestamp);
      formData.append('signature',  signature);
      formData.append('folder',     folder);
      formData.append('resource_type', 'auto');

      /* PDFs e DOCX devem usar endpoint 'raw', imagens usam 'image' */
      const isImage    = ['image/jpeg', 'image/png'].includes(file.mimetype);
      const endpoint   = isImage ? 'image' : 'raw';

      const uploadRes = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/${endpoint}/upload`,
        { method: 'POST', body: formData }
      );

      const data = await uploadRes.json();

      if (!data.secure_url) {
        throw new Error('Cloudinary: ' + (data.error?.message || JSON.stringify(data)));
      }

      /* URL limpa — para raw o Cloudinary já entrega o arquivo com extensão correta */
      res.status(200).json({ sucesso: true, link: data.secure_url });

    } catch (e) {
      jsonErr(res, 500, e.message);
    }
  });
}
