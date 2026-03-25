import argparse
import json
import sys


def flatten_result(raw_result):
    texts = []
    scores = []
    lines = []
    pages = raw_result if isinstance(raw_result, list) else [raw_result]
    for page in pages:
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
            lines.append({"text": text, "score": score})
    return {
        "text": "\n".join(texts).strip(),
        "avg_score": (sum(scores) / len(scores)) if scores else None,
        "lines": lines,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", required=True)
    parser.add_argument("--lang", required=True)
    parser.add_argument("--device", default="cpu")
    args = parser.parse_args()

    try:
        from paddleocr import PaddleOCR
    except Exception as exc:
        print(json.dumps({
            "ok": False,
            "error": "paddleocr import failed: " + str(exc),
        }, ensure_ascii=False))
        return 2

    try:
        ocr = PaddleOCR(
            use_angle_cls=False,
            lang=args.lang,
            show_log=False,
            use_gpu=args.device.lower().startswith("gpu"),
        )
        result = ocr.ocr(args.image, cls=False)
        normalized = flatten_result(result)
        if not normalized["text"]:
            print(json.dumps({
                "ok": False,
                "error": "paddleocr returned empty OCR text",
                "avg_score": normalized["avg_score"],
                "lines": normalized["lines"],
            }, ensure_ascii=False))
            return 3
        print(json.dumps({
            "ok": True,
            "text": normalized["text"],
            "avg_score": normalized["avg_score"],
            "lines": normalized["lines"],
            "lang": args.lang,
            "device": args.device,
        }, ensure_ascii=False))
        return 0
    except Exception as exc:
        print(json.dumps({
            "ok": False,
            "error": "paddleocr execution failed: " + str(exc),
        }, ensure_ascii=False))
        return 4


if __name__ == "__main__":
    raise SystemExit(main())
