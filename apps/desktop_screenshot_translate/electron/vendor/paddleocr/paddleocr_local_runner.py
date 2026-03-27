import argparse
import json
import os
import sys


def build_parser():
    parser = argparse.ArgumentParser()
    parser.add_argument('--worker', action='store_true')
    parser.add_argument('--image')
    parser.add_argument('--lang')
    parser.add_argument('--device', default='cpu')
    return parser


def flatten_result(raw_result):
    texts = []
    scores = []
    lines = []
    pages = raw_result if isinstance(raw_result, list) else [raw_result]
    for page in pages:
        try:
            rec_texts = page['rec_texts']
            rec_scores = page['rec_scores'] if 'rec_scores' in page else None
        except Exception:
            rec_texts = None
            rec_scores = None

        if isinstance(rec_texts, list):
            for index, raw_text in enumerate(rec_texts):
                text = str(raw_text).strip()
                if not text:
                    continue
                score = None
                if isinstance(rec_scores, list) and index < len(rec_scores):
                    try:
                        score = float(rec_scores[index])
                    except Exception:
                        score = None
                texts.append(text)
                if score is not None:
                    scores.append(score)
                lines.append({'text': text, 'score': score})
            continue

        if not isinstance(page, list):
            continue
        for item in page:
            if not isinstance(item, (list, tuple)) or len(item) < 2:
                continue
            text_info = item[1]
            if not isinstance(text_info, (list, tuple)) or len(text_info) < 1:
                continue
            text = str(text_info[0]).strip()
            if not text:
                continue
            score = None
            if len(text_info) > 1:
                try:
                    score = float(text_info[1])
                except Exception:
                    score = None
            texts.append(text)
            if score is not None:
                scores.append(score)
            lines.append({'text': text, 'score': score})
    return {
        'text': '\n'.join(texts).strip(),
        'avg_score': (sum(scores) / len(scores)) if scores else None,
        'lines': lines,
    }


def create_ocr(lang, device, paddle_ocr_cls):
    return paddle_ocr_cls(
        lang=lang,
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=False,
        text_det_limit_side_len=960,
        text_det_limit_type='max',
        device=device,
        enable_hpi=False,
        enable_mkldnn=False,
        enable_cinn=False,
    )


def run_ocr(ocr, image_path, lang, device):
    result = ocr.predict(image_path)
    normalized = flatten_result(result)
    if not normalized['text']:
        return {
            'ok': False,
            'error': 'paddleocr returned empty OCR text',
            'avg_score': normalized['avg_score'],
            'lines': normalized['lines'],
            'lang': lang,
            'device': device,
        }
    return {
        'ok': True,
        'text': normalized['text'],
        'avg_score': normalized['avg_score'],
        'lines': normalized['lines'],
        'lang': lang,
        'device': device,
    }


def warmup_ocr(cache, languages, device, paddle_ocr_cls):
    warmed = []
    for lang in languages:
        cache_key = f'{lang}|{device}'
        ocr = cache.get(cache_key)
        if ocr is None:
            ocr = create_ocr(lang, device, paddle_ocr_cls)
            cache[cache_key] = ocr
        warmed.append(lang)
    return {
        'ok': True,
        'warmed': warmed,
        'device': device,
    }


def worker_main(paddle_ocr_cls):
    cache = {}
    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue
        request_id = None
        try:
            payload = json.loads(line)
            request_id = payload.get('id')
            action = payload.get('action') or 'recognize'
            device = payload.get('device') or 'cpu'

            if action == 'warmup':
                languages = [str(item).strip() for item in payload.get('languages') or [] if str(item).strip()]
                if not languages:
                    response = {
                        'id': request_id,
                        'ok': False,
                        'error': 'warmup request requires at least one language',
                    }
                else:
                    response = warmup_ocr(cache, languages, device, paddle_ocr_cls)
                    response['id'] = request_id
            else:
                image_path = payload.get('image')
                lang = payload.get('lang')
                if not image_path or not lang:
                    response = {
                        'id': request_id,
                        'ok': False,
                        'error': 'worker request requires image and lang',
                    }
                else:
                    cache_key = f'{lang}|{device}'
                    ocr = cache.get(cache_key)
                    if ocr is None:
                        ocr = create_ocr(lang, device, paddle_ocr_cls)
                        cache[cache_key] = ocr
                    response = run_ocr(ocr, image_path, lang, device)
                    response['id'] = request_id
        except Exception as exc:
            response = {
                'id': request_id,
                'ok': False,
                'error': 'paddleocr execution failed: ' + str(exc),
            }
        print(json.dumps(response, ensure_ascii=False), flush=True)


def main():
    os.environ.setdefault('PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK', 'True')

    parser = build_parser()
    args = parser.parse_args()
    if not args.worker and (not args.image or not args.lang):
        parser.error('--image and --lang are required unless --worker is used')

    try:
        from paddleocr import PaddleOCR
    except Exception as exc:
        print(json.dumps({
            'ok': False,
            'error': 'paddleocr import failed: ' + str(exc),
        }, ensure_ascii=False))
        return 2

    if args.worker:
        worker_main(PaddleOCR)
        return 0

    try:
        ocr = create_ocr(args.lang, args.device, PaddleOCR)
        response = run_ocr(ocr, args.image, args.lang, args.device)
        print(json.dumps(response, ensure_ascii=False))
        return 0 if response['ok'] else 3
    except Exception as exc:
        print(json.dumps({
            'ok': False,
            'error': 'paddleocr execution failed: ' + str(exc),
        }, ensure_ascii=False))
        return 4


if __name__ == '__main__':
    raise SystemExit(main())
