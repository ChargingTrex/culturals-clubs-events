/**
 * RFC 9457 problem details, the same shape the Django backend returns.
 *
 * Keeping the shape identical means the pages render a refusal the same way in
 * either build, and swapping this app onto the real API is a base-URL change.
 */
export class Problem extends Error {
  constructor({ code, title, status, detail = "", errors = [] }) {
    super(detail || title);
    this.code = code;
    this.title = title;
    this.status = status;
    this.detail = detail;
    this.errors = errors;
  }
  toJSON() {
    return {
      type: `https://portal.college.edu/errors/${this.code.toLowerCase().replace(/_/g, "-")}`,
      title: this.title, status: this.status, detail: this.detail,
      code: this.code, errors: this.errors,
    };
  }
}

export const notFound = (detail = "No such resource, or it is not visible to you.") =>
  new Problem({ code: "NOT_FOUND", title: "Not found", status: 404, detail });

export const denied = (code, detail) =>
  new Problem({ code, title: "Not permitted", status: 403, detail });

export const conflict = (code, title, detail, errors) =>
  new Problem({ code, title, status: 409, detail, errors });

export const invalid = (code, title, detail, errors) =>
  new Problem({ code, title, status: 422, detail, errors });
