import { normalizeBrazilianWhatsappNumber } from "../../../services/ContactServices/ImportContactsCsvService";

describe("ImportContactsCsvService", () => {
  describe("normalizeBrazilianWhatsappNumber", () => {
    it("should convert number with ninth digit to eight-digit local format", () => {
      expect(normalizeBrazilianWhatsappNumber("5554981278711")).toBe(
        "555481278711"
      );
    });

    it("should keep valid number already normalized", () => {
      expect(normalizeBrazilianWhatsappNumber("555481278711")).toBe(
        "555481278711"
      );
    });

    it("should normalize common local formats", () => {
      expect(normalizeBrazilianWhatsappNumber("(054) 98127-8711")).toBe(
        "555481278711"
      );
      expect(normalizeBrazilianWhatsappNumber("054981278711")).toBe(
        "555481278711"
      );
      expect(normalizeBrazilianWhatsappNumber("5481278711")).toBe(
        "555481278711"
      );
    });

    it("should reject unsupported service numbers", () => {
      expect(normalizeBrazilianWhatsappNumber("0800 729 0080")).toBeNull();
      expect(normalizeBrazilianWhatsappNumber("+55 800 729 0080")).toBeNull();
    });

    it("should reject numbers outside required pattern", () => {
      expect(normalizeBrazilianWhatsappNumber("123")).toBeNull();
      expect(normalizeBrazilianWhatsappNumber("+1 202 555 0173")).toBeNull();
      expect(normalizeBrazilianWhatsappNumber("")).toBeNull();
    });
  });
});
