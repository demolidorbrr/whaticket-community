import React, { useEffect, useState } from "react";
import * as Yup from "yup";
import { Formik, Form, Field } from "formik";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  IconButton,
  InputAdornment,
  CircularProgress,
  makeStyles
} from "@material-ui/core";
import { Colorize } from "@material-ui/icons";
import { green } from "@material-ui/core/colors";
import { toast } from "react-toastify";

import api from "../../services/api";
import toastError from "../../errors/toastError";
import ColorPicker from "../ColorPicker";

const useStyles = makeStyles(theme => ({
  textField: {
    marginTop: theme.spacing(1)
  },
  btnWrapper: {
    position: "relative"
  },
  buttonProgress: {
    color: green[500],
    position: "absolute",
    top: "50%",
    left: "50%",
    marginTop: -12,
    marginLeft: -12
  },
  colorAdorment: {
    width: 20,
    height: 20,
    borderRadius: 4,
    border: "1px solid #d1d5db"
  }
}));

const schema = Yup.object().shape({
  name: Yup.string().min(2).max(60).required("Obrigatorio"),
  color: Yup.string()
    .matches(/^#[0-9a-f]{6}$/i, "Cor invalida. Use formato #RRGGBB")
    .required("Obrigatorio")
});

const TagModal = ({ open, onClose, tagId }) => {
  const classes = useStyles();
  const initialValues = {
    name: "",
    color: "#546e7a"
  };
  const [tag, setTag] = useState(initialValues);
  const [colorPickerModalOpen, setColorPickerModalOpen] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!open || !tagId) {
        setTag(initialValues);
        return;
      }

      try {
        const { data } = await api.get("/tags");
        const selectedTag = (data || []).find(item => item.id === tagId);
        if (selectedTag) {
          setTag({
            name: selectedTag.name || "",
            color: selectedTag.color || "#546e7a"
          });
        }
      } catch (err) {
        toastError(err);
      }
    };

    load();
  }, [open, tagId]);

  const handleSave = async values => {
    try {
      if (tagId) {
        await api.put(`/tags/${tagId}`, values);
      } else {
        await api.post("/tags", values);
      }

      toast.success("Tag salva com sucesso");
      onClose(true);
    } catch (err) {
      toastError(err);
    }
  };

  const handleClose = () => {
    setColorPickerModalOpen(false);
    setTag(initialValues);
    onClose(false);
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>{tagId ? "Editar Tag" : "Nova Tag"}</DialogTitle>
      <Formik
        initialValues={tag}
        enableReinitialize
        validationSchema={schema}
        onSubmit={(values, actions) => {
          handleSave(values);
          actions.setSubmitting(false);
        }}
      >
        {({ touched, errors, isSubmitting, values, setFieldValue }) => (
          <Form>
            <DialogContent dividers>
              <Field
                as={TextField}
                name="name"
                label="Nome"
                fullWidth
                variant="outlined"
                className={classes.textField}
                error={touched.name && Boolean(errors.name)}
                helperText={touched.name && errors.name}
              />
              <Field
                as={TextField}
                name="color"
                label="Cor"
                fullWidth
                variant="outlined"
                className={classes.textField}
                error={touched.color && Boolean(errors.color)}
                helperText={touched.color && errors.color}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <div
                        style={{ backgroundColor: values.color }}
                        className={classes.colorAdorment}
                      />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        size="small"
                        color="default"
                        onClick={() => setColorPickerModalOpen(true)}
                      >
                        <Colorize />
                      </IconButton>
                    </InputAdornment>
                  )
                }}
              />
              <ColorPicker
                open={colorPickerModalOpen}
                currentColor={values.color}
                handleClose={() => setColorPickerModalOpen(false)}
                onChange={color => {
                  setFieldValue("color", color);
                  setTag(prev => ({ ...prev, color }));
                }}
              />
            </DialogContent>
            <DialogActions>
              <Button onClick={handleClose} color="secondary" variant="outlined">
                Cancelar
              </Button>
              <Button
                type="submit"
                color="primary"
                variant="contained"
                className={classes.btnWrapper}
                disabled={isSubmitting}
              >
                Salvar
                {isSubmitting && (
                  <CircularProgress size={24} className={classes.buttonProgress} />
                )}
              </Button>
            </DialogActions>
          </Form>
        )}
      </Formik>
    </Dialog>
  );
};

export default TagModal;
