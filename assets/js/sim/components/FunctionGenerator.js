class FunctionGenerator {
    constructor(nPlus, nCom, nNeg, {
        refG = 0,
        seriesG = 0,
        valuePlus = 0,
        valueNeg = 0
    } = {}) {
        this.nPlus = nPlus;
        this.nCom = nCom;
        this.nNeg = nNeg;
        this.refG = refG;
        this.seriesG = seriesG;
        this.valuePlus = valuePlus;
        this.valueNeg = valueNeg;
    }

    stamp(stamps) {
        if (this.nCom !== -1 && this.refG) {
            stamps.stampConductance(this.nCom, -1, this.refG);
        }
        if (this.nPlus !== -1) {
            if (this.seriesG) stamps.stampConductance(this.nPlus, this.nCom, this.seriesG);
            stamps.stampVoltageSource(this.nPlus, this.nCom, this.valuePlus);
        }
        if (this.nNeg !== -1) {
            if (this.seriesG) stamps.stampConductance(this.nNeg, this.nCom, this.seriesG);
            stamps.stampVoltageSource(this.nNeg, this.nCom, this.valueNeg);
        }
    }
}

export { FunctionGenerator };
export default FunctionGenerator;
